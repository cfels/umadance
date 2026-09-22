{ src }:
{
  config,
  lib,
  ...
}:
let
  cfg = config.programs.umadance;
in
{
  options.programs.umadance = {
    enable = lib.mkEnableOption "the uma overlay in VS Code";
  };

  config = lib.mkIf cfg.enable {
    nixpkgs.overlays = [ (import ./overlay.nix { inherit src; }) ];
    programs.vscode.enable = lib.mkDefault true;
  };
}
