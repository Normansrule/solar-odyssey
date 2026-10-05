// Solar Odyssey desktop app: a window that shows the bundled, offline copy of site/.
// It registers no custom commands and no plugins, opens no ports, and makes no network
// requests of its own; the page itself runs under the same strict Content Security Policy
// as the website (see tauri.conf.json and docs/SECURITY_MODEL.md).
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Solar Odyssey");
}
