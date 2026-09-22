{
  description = "uma from umamusume dancing over your VS Code window";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs =
    { self, nixpkgs }:
    let
      systems = [
        "x86_64-linux"
        "aarch64-linux"
        "aarch64-darwin"
      ];
      forAllSystems = nixpkgs.lib.genAttrs systems;
      overlay = import ./nix/overlay.nix { src = self; };
      module = import ./nix/umadance-vscode.nix { src = self; };
    in
    {
      overlays.default = overlay;

      packages = forAllSystems (
        system:
        let
          lib = nixpkgs.lib;
          pkgs = import nixpkgs {
            inherit system;
            config.allowUnfreePredicate =
              pkg: builtins.elem (lib.getName pkg) [ "vscode" "vscode-with-extensions" ];
            overlays = [ overlay ];
          };
        in
        {
          default = pkgs.vscode;
          umadance-vscode = pkgs.vscode;
        }
      );

      nixosModules = {
        default = module;
        umadance-vscode = module;
      };

      homeManagerModules = {
        default = module;
        umadance-vscode = module;
      };
    };
}
