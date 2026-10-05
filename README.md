<div align="center">

## 🌸 UMADANCE 🌸
**an VSCode extension, that shows uma's from umamusume dancing around ur working enviroment.**

</div>

### Add to VSCode
[moxiu.Umadance | VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=moxiu.umadance)

if you are on NixOS then do this:<br>
**NixOS / Nix**

add this flake:

```nix
inputs.umadance = {
  url = "github:cfels/umadance";
  inputs.nixpkgs.follows = "nixpkgs";
};
```

Then enable the module - it patches `pkgs.vscode` and `pkgs.vscodium`, so whichever editor you install gets the uma wired into `workbench.html`:

```nix
modules = [ umadance.nixosModules.default { programs.umadance.enable = true; } ];
```

You still install the editor yourself, with `programs.vscode.enable = true;` or `pkgs.vscodium`. Or just apply the overlay:

```nix
nixpkgs.overlays = [ umadance.overlays.default ];
```

### Compile extension

**VS Code (any OS)**

just run:

```
./build-ext.sh --vsix
```

### Usage
INSERT - to open/close the menu

### Screenshots

<table border="0">
  <tr>
    <td>
      <img src="./screenshots/menuitself.png" width="450"><br><br>
      <img src="./screenshots/umasmenu.png" width="450"><br><br>
      <img src="./screenshots/umas.png" width="450">
    </td>
  </tr>
</table>


### License
this project is licensed under [MIT License](https://github.com/cfels/umadance/blob/main/LICENSE)
