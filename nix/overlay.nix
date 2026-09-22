{ src }:
final: prev: {
  vscode =
    (import ./patch-vscode.nix {
      inherit src;
      nodejs = final.nodejs;
      isDarwin = prev.stdenv.hostPlatform.isDarwin;
    })
      prev.vscode;
}
