// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod commands;
mod tray;

fn main() {
    let result = tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            tray::create_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::read_queue_inbox,
            commands::read_context_global,
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        eprintln!("Application error: {e}");
        std::process::exit(1);
    }
}
