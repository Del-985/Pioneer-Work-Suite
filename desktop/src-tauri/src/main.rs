// desktop/src-tauri/src/main.rs

#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        // If you add custom commands later, they’ll be attached here
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}