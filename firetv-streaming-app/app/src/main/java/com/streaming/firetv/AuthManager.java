package com.streaming.firetv;

import android.content.Context;
import android.content.SharedPreferences;
import android.util.Log;
import okhttp3.*;
import org.json.JSONObject;
import java.io.IOException;
import java.io.InputStream;
import java.util.concurrent.TimeUnit;

public class AuthManager {
    private static final String TAG = "AuthManager";
    private Context context;
    private OkHttpClient client;
    private SharedPreferences prefs;
    private String cloudflareToken;
    private String discordWebhook;
    
    public AuthManager(Context context) {
        this.context = context;
        this.prefs = context.getSharedPreferences("auth_prefs", Context.MODE_PRIVATE);
        
        // Cliente HTTP con timeout
        this.client = new OkHttpClient.Builder()
            .connectTimeout(10, TimeUnit.SECONDS)
            .readTimeout(10, TimeUnit.SECONDS)
            .build();
            
        loadConfiguration();
    }
    
    private void loadConfiguration() {
        try {
            // Cargar config.json desde assets
            InputStream is = context.getAssets().open("config.json");
            byte[] buffer = new byte[is.available()];
            is.read(buffer);
            is.close();
            
            String json = new String(buffer, "UTF-8");
            JSONObject config = new JSONObject(json);
            
            cloudflareToken = config.getString("cloudflare_token");
            discordWebhook = config.getString("discord_webhook");
            
            Log.d(TAG, "Configuration loaded successfully");
        } catch (Exception e) {
            Log.e(TAG, "Error loading configuration: " + e.getMessage());
            // Usar valores por defecto
            cloudflareToken = "default_token";
            discordWebhook = "https://discord.com/api/webhooks/default";
        }
    }
    
    public interface AuthCallback {
        void onSuccess(String token);
        void onError(String error);
    }
    
    public void authenticate(AuthCallback callback) {
        // Verificar token guardado
        String savedToken = prefs.getString("session_token", null);
        if (savedToken != null && isTokenValid(savedToken)) {
            callback.onSuccess(savedToken);
            return;
        }
        
        // Nueva autenticación
        performAuthentication(callback);
    }
    
    private void performAuthentication(AuthCallback callback) {
        // Paso 1: Verificar Cloudflare
        verifyCloudflare(new CloudflareCallback() {
            @Override
            public void onSuccess() {
                // Paso 2: Notificar a Discord
                notifyDiscord(callback);
            }
            
            @Override
            public void onError(String error) {
                callback.onError("Cloudflare: " + error);
            }
        });
    }
    
    private void verifyCloudflare(CloudflareCallback cfCallback) {
        if (cloudflareToken.equals("default_token") || cloudflareToken.isEmpty()) {
            // Modo desarrollo - skip Cloudflare
            cfCallback.onSuccess();
            return;
        }
        
        Request request = new Request.Builder()
            .url("https://api.cloudflare.com/client/v4/user/tokens/verify")
            .addHeader("Authorization", "Bearer " + cloudflareToken)
            .addHeader("Content-Type", "application/json")
            .get()
            .build();
            
        client.newCall(request).enqueue(new Callback() {
            @Override
            public void onResponse(Call call, Response response) throws IOException {
                if (response.code() == 200) {
                    Log.d(TAG, "Cloudflare verification successful");
                    cfCallback.onSuccess();
                } else {
                    cfCallback.onError("Invalid token - Code: " + response.code());
                }
                response.close();
            }
            
            @Override
            public void onFailure(Call call, IOException e) {
                Log.e(TAG, "Cloudflare verification failed: " + e.getMessage());
                cfCallback.onError(e.getMessage());
            }
        });
    }
    
    private void notifyDiscord(AuthCallback callback) {
        if (discordWebhook.contains("default")) {
            // Modo desarrollo - generar token sin Discord
            String token = generateToken();
            saveToken(token);
            callback.onSuccess(token);
            return;
        }
        
        try {
            JSONObject payload = new JSONObject();
            payload.put("content", "New FireTV connection");
            payload.put("username", "FireTV App");
            
            JSONObject embed = new JSONObject();
            embed.put("title", "Authentication Request");
            embed.put("description", "User connecting from FireTV device");
            embed.put("color", 5814783);
            
            RequestBody body = RequestBody.create(
                MediaType.parse("application/json"),
                payload.toString()
            );
            
            Request request = new Request.Builder()
                .url(discordWebhook)
                .post(body)
                .build();
                
            client.newCall(request).enqueue(new Callback() {
                @Override
                public void onResponse(Call call, Response response) throws IOException {
                    if (response.code() == 204) {
                        String token = generateToken();
                        saveToken(token);
                        callback.onSuccess(token);
                    } else {
                        callback.onError("Discord webhook failed");
                    }
                    response.close();
                }
                
                @Override
                public void onFailure(Call call, IOException e) {
                    callback.onError("Discord: " + e.getMessage());
                }
            });
        } catch (Exception e) {
            callback.onError("Discord setup error: " + e.getMessage());
        }
    }
    
    private String generateToken() {
        return "ftv_" + System.currentTimeMillis() + "_" + Math.random();
    }
    
    private void saveToken(String token) {
        prefs.edit().putString("session_token", token).apply();
    }
    
    private boolean isTokenValid(String token) {
        // Validar si el token aún es válido (ejemplo: 24 horas)
        // Por ahora siempre retorna true
        return true;
    }
    
    interface CloudflareCallback {
        void onSuccess();
        void onError(String error);
    }
}
