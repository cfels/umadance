{ pkgs, lib, config, ... }:

let
	project = /home/moxiu/projects/umadance/umadance;
	overlay = final: prev: {
		vscode = prev.vscode.overrideAttrs (old: {
			postInstall = (old.postInstall or "") + ''
				${final.nodejs}/bin/node ${project}/overlay/apply.js \
					--app-dir "$out/lib/vscode/resources/app" \
					--overlay-dir ${project}/overlay \
					--uma-dir ${project}/src/uma
			'';
		});
	};
in
{
	nixpkgs.overlays = [ overlay ];
}
