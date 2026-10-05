{
  src,
  nodejs,
}:
vscode:
vscode.overrideAttrs (old: {
  postInstall = (old.postInstall or "") + ''
    appDir=$(dirname "$(find -L "$out" -maxdepth 12 -type f -path '*/resources/app/product.json' -print -quit)")
    if [ ! -f "$appDir/out/vs/code/electron-browser/workbench/workbench.html" ]; then
      echo "umadance: no workbench.html found under $out" >&2
      exit 1
    fi
    ${nodejs}/bin/node ${src}/overlay/apply.js \
      --app-dir "$appDir" \
      --overlay-dir ${src}/overlay \
      --uma-dir ${src}/src/uma
  '';
})
