//! Vloží ikonu OpenSosacTV do exe (Průzkumník, připnutí na hlavní panel).

fn main() {
    println!("cargo:rerun-if-changed=assets/icon.ico");

    #[cfg(windows)]
    if std::env::var("CARGO_CFG_TARGET_OS").as_deref() == Ok("windows") {
        let mut resource = winresource::WindowsResource::new();
        resource.set_icon("assets/icon.ico");
        resource.set("ProductName", "OpenSosacTV");
        resource.set(
            "FileDescription",
            "OpenSosacTV, neoficiální klient pro Sosáč",
        );
        if let Err(e) = resource.compile() {
            // Chybějící kompilátor prostředků stojí jen ikonu, ne build.
            println!("cargo:warning=nepodařilo se vložit ikonu: {e}");
        }
    }
}
