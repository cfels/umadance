{
  src,
  nodejs,
  isDarwin ? false,
}:
vscode:
let
  appDirectory =
    if isDarwin then
      "Applications/Visual Studio Code.app/Contents/Resources/app"
    else
      "lib/vscode/resources/app";
in
vscode.overrideAttrs (old: {
  postInstall = (old.postInstall or "") + ''
    ${nodejs}/bin/node ${src}/overlay/apply.js \
      --app-dir "$out/${appDirectory}" \
      --overlay-dir ${src}/overlay \
      --uma-dir ${src}/src/uma
  '';
})
