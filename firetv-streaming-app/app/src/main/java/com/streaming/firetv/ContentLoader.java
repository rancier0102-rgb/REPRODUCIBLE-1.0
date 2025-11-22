package com.streaming.firetv;

import android.content.Context;
import android.util.Log;
import com.google.gson.Gson;
import com.google.gson.reflect.TypeToken;
import okhttp3.*;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

public class ContentLoader {
    private static final String TAG = "ContentLoader";
    private Context context;
    private OkHttpClient client;
    private Gson gson;
    private static final String GITHUB_BASE_URL = 
        "https://raw.githubusercontent.com/yourusername/yourrepo/main/content/";
    
    public ContentLoader(Context context) {
        this.context = context;
        this.gson = new Gson();
        this.client = new OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .build();
    }
    
    public interface LoadCallback {
        void onContentLoaded(List<Content> items);
        void onError(String error);
    }
    
    public void loadChunks(String token, LoadCallback callback) {
        // Primero intentar cargar desde GitHub
        loadFromGitHub(token, callback);
        
        // Si falla, cargar desde assets locales
        if (GITHUB_BASE_URL.contains("yourusername")) {
            loadFromAssets(callback);
        }
    }
    
    private void loadFromGitHub(String token, LoadCallback callback) {
        // Cargar manifest
        Request manifestRequest = new Request.Builder()
            .url(GITHUB_BASE_URL + "manifest.json")
            .addHeader("Authorization", "Bearer " + token)
            .build();
            
        client.newCall(manifestRequest).enqueue(new Callback() {
            @Override
            public void onResponse(Call call, Response response) throws IOException {
                if (response.isSuccessful()) {
                    String json = response.body().string();
                    Manifest manifest = gson.fromJson(json, Manifest.class);
                    loadChunksFromManifest(manifest, token, callback);
                } else {
                    loadFromAssets(callback);
                }
            }
            
            @Override
            public void onFailure(Call call, IOException e) {
                Log.e(TAG, "Failed to load from GitHub: " + e.getMessage());
                loadFromAssets(callback);
            }
        });
    }
    
    private void loadChunksFromManifest(Manifest manifest, String token, LoadCallback callback) {
        List<Content> allContent = new ArrayList<>();
        int chunksToLoad = manifest.chunks.size();
        final int[] chunksLoaded = {0};
        
        for (String chunkFile : manifest.chunks) {
            Request request = new Request.Builder()
                .url(GITHUB_BASE_URL + chunkFile)
                .addHeader("Authorization", "Bearer " + token)
                .build();
                
            client.newCall(request).enqueue(new Callback() {
                @Override
                public void onResponse(Call call, Response response) throws IOException {
                    if (response.isSuccessful()) {
                        String json = response.body().string();
                        ContentChunk chunk = gson.fromJson(json, ContentChunk.class);
                        
                        synchronized (allContent) {
                            allContent.addAll(chunk.items);
                            chunksLoaded[0]++;
                            
                            if (chunksLoaded[0] == chunksToLoad) {
                                callback.onContentLoaded(allContent);
                            }
                        }
                    }
                }
                
                @Override
                public void onFailure(Call call, IOException e) {
                    Log.e(TAG, "Failed to load chunk: " + chunkFile);
                    chunksLoaded[0]++;
                    if (chunksLoaded[0] == chunksToLoad && !allContent.isEmpty()) {
                        callback.onContentLoaded(allContent);
                    }
                }
            });
        }
    }
    
    private void loadFromAssets(LoadCallback callback) {
        try {
            // Cargar datos locales de ejemplo
            List<Content> items = new ArrayList<>();
            
            // Cargar movies.json desde assets
            InputStream is = context.getAssets().open("movies.json");
            byte[] buffer = new byte[is.available()];
            is.read(buffer);
            is.close();
            
            String json = new String(buffer, "UTF-8");
            ContentChunk chunk = gson.fromJson(json, ContentChunk.class);
            items.addAll(chunk.items);
            
            // También cargar series.json si existe
            try {
                InputStream is2 = context.getAssets().open("series.json");
                byte[] buffer2 = new byte[is2.available()];
                is2.read(buffer2);
                is2.close();
                
                String json2 = new String(buffer2, "UTF-8");
                ContentChunk chunk2 = gson.fromJson(json2, ContentChunk.class);
                items.addAll(chunk2.items);
            } catch (IOException e) {
                // Series.json no existe, continuar solo con movies
            }
            
            callback.onContentLoaded(items);
            
        } catch (Exception e) {
            Log.e(TAG, "Error loading from assets: " + e.getMessage());
            // Crear contenido de ejemplo
            List<Content> demoContent = createDemoContent();
            callback.onContentLoaded(demoContent);
        }
    }
    
    private List<Content> createDemoContent() {
        List<Content> items = new ArrayList<>();
        
        for (int i = 1; i <= 12; i++) {
            Content content = new Content();
            content.id = "demo_" + i;
            content.title = "Demo Content " + i;
            content.description = "This is demo content item #" + i;
            content.thumbnail = "https://via.placeholder.com/300x450/FF0000/FFFFFF?text=Demo+" + i;
            content.url = "https://example.com/stream" + i + ".m3u8";
            content.type = (i % 2 == 0) ? "movie" : "series";
            content.duration = "1:30:00";
            content.year = 2024;
            content.rating = 7.5 + (i * 0.1);
            items.add(content);
        }
        
        return items;
    }
    
    // Clases de modelo
    public static class Content {
        public String id;
        public String title;
        public String description;
        public String thumbnail;
        public String url;
        public String type;
        public String duration;
        public int year;
        public double rating;
    }
    
    static class Manifest {
        List<String> chunks;
        int totalItems;
        String version;
    }
    
    static class ContentChunk {
        String chunkId;
        List<Content> items;
    }
}
