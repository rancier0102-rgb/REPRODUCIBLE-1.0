package com.streaming.firetv;

import android.app.Activity;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.view.KeyEvent;
import android.widget.TextView;
import android.widget.Toast;
import androidx.recyclerview.widget.GridLayoutManager;
import androidx.recyclerview.widget.RecyclerView;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {
    
    private AuthManager authManager;
    private ContentLoader contentLoader;
    private RecyclerView recyclerView;
    private TextView statusText;
    private ContentAdapter adapter;
    private Handler handler;
    
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        setContentView(R.layout.activity_main);
        
        handler = new Handler(Looper.getMainLooper());
        initializeViews();
        initializeComponents();
        startAuthentication();
    }
    
    private void initializeViews() {
        recyclerView = findViewById(R.id.content_grid);
        statusText = findViewById(R.id.status_text);
        
        // Configurar grid para TV
        GridLayoutManager gridManager = new GridLayoutManager(this, 4);
        recyclerView.setLayoutManager(gridManager);
        recyclerView.setFocusable(true);
        
        // Adapter vacío inicial
        adapter = new ContentAdapter(new ArrayList<>(), this);
        recyclerView.setAdapter(adapter);
    }
    
    private void initializeComponents() {
        authManager = new AuthManager(this);
        contentLoader = new ContentLoader(this);
    }
    
    private void startAuthentication() {
        updateStatus("Autenticando...");
        
        authManager.authenticate(new AuthManager.AuthCallback() {
            @Override
            public void onSuccess(String token) {
                updateStatus("Cargando contenido...");
                loadContent(token);
            }
            
            @Override
            public void onError(String error) {
                updateStatus("Error: " + error);
                showToast("Error de autenticación: " + error);
            }
        });
    }
    
    private void loadContent(String token) {
        contentLoader.loadChunks(token, new ContentLoader.LoadCallback() {
            @Override
            public void onContentLoaded(List<ContentLoader.Content> items) {
                handler.post(() -> {
                    updateStatus("");
                    adapter.updateContent(items);
                    recyclerView.requestFocus();
                });
            }
            
            @Override
            public void onError(String error) {
                handler.post(() -> {
                    updateStatus("Error cargando contenido");
                    showToast("Error: " + error);
                });
            }
        });
    }
    
    private void updateStatus(String message) {
        handler.post(() -> {
            if (statusText != null) {
                statusText.setText(message);
            }
        });
    }
    
    private void showToast(String message) {
        handler.post(() -> {
            Toast.makeText(MainActivity.this, message, Toast.LENGTH_LONG).show();
        });
    }
    
    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        // Manejo del control remoto FireTV
        switch (keyCode) {
            case KeyEvent.KEYCODE_DPAD_CENTER:
            case KeyEvent.KEYCODE_ENTER:
                // Seleccionar item
                return true;
            case KeyEvent.KEYCODE_BACK:
                // Salir de la app
                finish();
                return true;
            case KeyEvent.KEYCODE_MENU:
                // Recargar contenido
                startAuthentication();
                return true;
        }
        return super.onKeyDown(keyCode, event);
    }
}
