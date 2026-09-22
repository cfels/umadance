<div align="center">

## 🌸 UMADANCE 🌸
**an VSCode extension, that shows uma's from umamusume dancing around ur working enviroment.**

</div>

### Compile extension

**VS Code (any OS)**

just run:

```
./build-ext.sh --vsix
```


**NixOS / Nix**

add this flake:

```nix
inputs.umadance = {
  url = "github:cfels/umadance";
  inputs.nixpkgs.follows = "nixpkgs";
};
```

Then enable the module for a patched `programs.vscode`:

```nix
modules = [ umadance.nixosModules.default { programs.umadance.enable = true; } ];
```

Or just apply the overlay, if you would rather keep `pkgs.vscode` patched globally:

```nix
nixpkgs.overlays = [ umadance.overlays.default ];
```

### Usage
INSERT - to open/close the menu

### Screenshots

<table border="0">
  <tr>
    <td>
      <img src="https://github.com/cfels/umadance/blob/68f66aed5af4d15c78100eabc050ab38c55cce5a/screenshots/menuitself.png" width="450"><br><br>
      <img src="https://github.com/cfels/umadance/blob/68f66aed5af4d15c78100eabc050ab38c55cce5a/screenshots/umas%2Bmenu.png" width="450"><br><br>
      <img src="https://github.com/cfels/umadance/blob/68f66aed5af4d15c78100eabc050ab38c55cce5a/screenshots/umas.png" width="450">
    </td>
  </tr>
</table>


### License
this project is licensed under [MIT License](https://github.com/cfels/umadance/blob/main/LICENSE)
