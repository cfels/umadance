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
    enable = lib.mkEnableOption "the uma overlay in VS Code and VSCodium";
  };

  config = lib.mkIf cfg.enable {
    nixpkgs.overlays = [ (import ./overlay.nix { inherit src; }) ];
  };
}
