#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri_plugin_updater::Builder as UpdaterBuilder;

fn main() {
    tauri::Builder::default()
        // Prepare the updater plugin (we’ll actually *use* it in a later step)
        .plugin(
            UpdaterBuilder::new()
                // For now we don’t customize anything here; we’ll add callbacks
                // and proper update endpoints in a later step.
                .build(),
        )
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}