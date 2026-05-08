use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::TrayIconBuilder,
    App, Manager,
};

pub fn create_tray(app: &App) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Open evergreen-terrace", true, None::<&str>)?;
    let queue_count = MenuItem::with_id(app, "queue_count", "Queue: 0 items", false, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

    let menu = Menu::with_items(app, &[&open, &queue_count, &separator, &quit])?;

    TrayIconBuilder::new()
        .menu(&menu)
        .tooltip("evergreen-terrace")
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .build(app)?;

    Ok(())
}
