use std::fs;
use std::path::Path;

#[tauri::command]
pub fn read_queue_inbox(queue_root: String) -> Result<String, String> {
    let inbox_dir = Path::new(&queue_root).join("queue").join("inbox");
    if !inbox_dir.exists() {
        return Ok("[]".to_string());
    }

    let mut items: Vec<String> = Vec::new();
    let entries = fs::read_dir(&inbox_dir).map_err(|e| e.to_string())?;

    for entry in entries {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();
        if path.extension().and_then(|s| s.to_str()) == Some("toml") {
            let content = fs::read_to_string(&path).map_err(|e| e.to_string())?;
            items.push(content);
        }
    }

    serde_json::to_string(&items).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn read_context_global(queue_root: String) -> Result<String, String> {
    let path = Path::new(&queue_root).join("context").join("global.toml");
    fs::read_to_string(&path).map_err(|e| e.to_string())
}
