{
  description = "cv-forge — tailor a CV from a structured profile, render it to PDF";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      system = "x86_64-linux";
      pkgs = import nixpkgs { inherit system; };
    in {
      devShells.${system}.default = pkgs.mkShell {
        # NOTE: nodejs is deliberately NOT in this list. On nixos-unstable it
        # currently builds from source (~20min) instead of substituting from
        # cache.nixos.org, which makes the shell hostile to enter. Use the
        # system Node 22 (see package.json engines). Revisit by pinning
        # nixpkgs to a revision where nodejs_22 is substitutable.
        packages = [
          pkgs.playwright-driver.browsers   # playwright-core 1.63.0 — MUST match package.json
          pkgs.carlito                      # the resume face; a fallback silently reflows to 2 pages
          pkgs.fontconfig
          pkgs.pandoc                       # ATS .docx
          pkgs.poppler-utils                # pdfinfo/pdftotext for the fidelity test
        ];

        # Playwright on NixOS: never let npm download its own browsers — the
        # bundled binaries are linked against FHS paths that do not exist here.
        PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
        PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";

        # Without this, chromium cannot see Carlito even though it is in the
        # closure, and the page reflows with no error.
        FONTCONFIG_FILE = pkgs.makeFontsConf { fontDirectories = [ pkgs.carlito ]; };
      };
    };
}
