{ src }:
final: prev:
let
  patch = import ./patch-vscode.nix {
    inherit src;
    nodejs = final.nodejs;
  };
in
{
  vscode = patch prev.vscode;
  vscodium = patch prev.vscodium;
}
