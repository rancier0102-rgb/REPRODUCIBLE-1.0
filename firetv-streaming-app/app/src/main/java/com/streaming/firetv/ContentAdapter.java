package com.streaming.firetv;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.view.LayoutInflater;
import android.view.View;
import android.view.ViewGroup;
import android.widget.ImageView;
import android.widget.TextView;
import android.widget.Toast;
import androidx.recyclerview.widget.RecyclerView;
import com.bumptech.glide.Glide;
import java.util.List;

public class ContentAdapter extends RecyclerView.Adapter<ContentAdapter.ViewHolder> {
    
    private List<ContentLoader.Content> items;
    private Context context;
    
    public ContentAdapter(List<ContentLoader.Content> items, Context context) {
        this.items = items;
        this.context = context;
    }
    
    public void updateContent(List<ContentLoader.Content> newItems) {
        this.items = newItems;
        notifyDataSetChanged();
    }
    
    @Override
    public ViewHolder onCreateViewHolder(ViewGroup parent, int viewType) {
        View view = LayoutInflater.from(parent.getContext())
            .inflate(R.layout.content_item, parent, false);
        return new ViewHolder(view);
    }
    
    @Override
    public void onBindViewHolder(ViewHolder holder, int position) {
        ContentLoader.Content item = items.get(position);
        
        holder.titleText.setText(item.title);
        holder.typeText.setText(item.type.toUpperCase());
        
        // Cargar imagen con Glide
        Glide.with(context)
            .load(item.thumbnail)
            .placeholder(R.drawable.placeholder)
            .error(R.drawable.error_image)
            .into(holder.thumbnailImage);
        
        // Click listener
        holder.itemView.setOnClickListener(v -> {
            playContent(item);
        });
        
        // Focus listener para TV
        holder.itemView.setOnFocusChangeListener((v, hasFocus) -> {
            if (hasFocus) {
                v.setScaleX(1.1f);
                v.setScaleY(1.1f);
                v.setElevation(10);
            } else {
                v.setScaleX(1.0f);
                v.setScaleY(1.0f);
                v.setElevation(0);
            }
        });
    }
    
    @Override
    public int getItemCount() {
        return items != null ? items.size() : 0;
    }
    
    private void playContent(ContentLoader.Content content) {
        try {
            // Abrir con reproductor externo
            Intent intent = new Intent(Intent.ACTION_VIEW);
            intent.setDataAndType(Uri.parse(content.url), "video/*");
            context.startActivity(intent);
        } catch (Exception e) {
            Toast.makeText(context, 
                "No se puede reproducir: " + content.title, 
                Toast.LENGTH_SHORT).show();
        }
    }
    
    static class ViewHolder extends RecyclerView.ViewHolder {
        ImageView thumbnailImage;
        TextView titleText;
        TextView typeText;
        
        ViewHolder(View view) {
            super(view);
            thumbnailImage = view.findViewById(R.id.thumbnail);
            titleText = view.findViewById(R.id.title);
            typeText = view.findViewById(R.id.type);
            
            // Hacer el item focuseable para navegación con control remoto
            view.setFocusable(true);
            view.setFocusableInTouchMode(true);
        }
    }
}
