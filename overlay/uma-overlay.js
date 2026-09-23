(function () {
	'use strict';

	var ASSET_DIR = './uma/';
	var ASSET_MANIFEST = './uma-assets.js';
	var ASSET_POLL_MS = 4000;
	var STORAGE_KEY = 'umadance.overlay.v1';
	var MASTER_KEY = 'umadance.overlay.hidden';
	var MENU_KEY = 'umadance.overlay.menu';
	var MENU_TOGGLE = 'insert';
	var MASTER_TOGGLE = 'u';
	var DEFAULT_SIZE = 112;
	var MIN_SIZE = 32;
	var MAX_SIZE = 360;
	var SIZE_STEP = 0.15;
	var MARGIN_PX = 0.05;
	var MENU_WIDTH = 190;
	var TURN_EPSILON = 0.004;
	var MASTER_LABEL = 'enable umas';
	var LABELS = {
		'bakushin-clap.gif': 'bakushin clap',
		'dance-machan.gif': 'dance machan',
		'dance2-machan.gif': 'dance2 machan',
		'gentildona-dance.gif': 'gentildona dance',
		'gentildona-dance2.gif': 'gentildona dance2',
		'mambo-brick.gif': 'mambo brick',
		'oguri-dance.gif': 'oguri dance',
		'operao.gif': 'operao',
		'satono.gif': 'satono',
		'stillinlove.gif': 'stillinlove',
		'tachyon-dance.gif': 'tachyon dance',
		'tomamo.gif': 'tomamo'
	};
	var SAMPLE_WIDTH = 96;
	var SAMPLE_TICKS = 320;

	var names = Array.isArray(window.__umadanceAssets) ? window.__umadanceAssets.slice() : [];
	if (names.length === 0) {
		return;
	}

	var reduceMotion = window.matchMedia
		? window.matchMedia('(prefers-reduced-motion: reduce)')
		: { matches: false };

	var items = [];
	var root = null;
	var menu = null;
	var menuList = null;
	var masterBox = null;
	var saved = readSaved();

	function clamp(value, min, max) {
		if (value < min) { return min; }
		if (value > max) { return max; }
		return value;
	}

	function label(name) {
		if (LABELS[name]) {
			return LABELS[name];
		}
		return name.replace(/\.gif$/i, '').replace(/[-_]+/g, ' ');
	}

	function readSaved() {
		try {
			var raw = window.localStorage.getItem(STORAGE_KEY);
			if (!raw) { return {}; }
			var parsed = JSON.parse(raw);
			return parsed && typeof parsed === 'object' ? parsed : {};
		} catch (error) {
			return {};
		}
	}

	function readStored(key) {
		try {
			return window.localStorage.getItem(key);
		} catch (error) {
			return null;
		}
	}

	function store(key, value) {
		try {
			window.localStorage.setItem(key, value);
		} catch (error) {
			return;
		}
	}

	function collect() {
		var state = {};
		items.forEach(function (item) {
			state[item.name] = {
				x: item.x,
				y: item.y,
				locked: item.locked,
				size: item.size,
				hidden: item.hidden
			};
		});
		return state;
	}

	function writeSaved() {
		store(STORAGE_KEY, JSON.stringify(collect()));
	}

	function randomSpot() {
		return {
			x: MARGIN_PX + Math.random() * (1 - MARGIN_PX * 2),
			y: MARGIN_PX + Math.random() * (1 - MARGIN_PX * 2)
		};
	}

	function place(item) {
		var rectWidth = item.el.offsetWidth;
		var rectHeight = item.el.offsetHeight;
		var width = window.innerWidth;
		var height = window.innerHeight;
		var box = item.box || { left: 0, top: 0, right: 1, bottom: 1 };
		var centerX = (box.left + box.right) / 2 - 0.5;
		var centerY = (box.top + box.bottom) / 2 - 0.5;
		var margin = 4;
		var minLeft = rectWidth * (0.5 - box.left) + margin;
		var maxLeft = Math.max(minLeft, width - margin - rectWidth * (box.right - 0.5));
		var minTop = rectHeight * (0.5 - box.top) + margin;
		var maxTop = Math.max(minTop, height - margin - rectHeight * (box.bottom - 0.5));
		item.el.style.left = clamp(item.x * width - centerX * rectWidth, minLeft, maxLeft) + 'px';
		item.el.style.top = clamp(item.y * height - centerY * rectHeight, minTop, maxTop) + 'px';
		if (item.x - item.facing > TURN_EPSILON) {
			item.img.style.transform = 'scaleX(1)';
			item.facing = item.x;
		} else if (item.x - item.facing < -TURN_EPSILON) {
			item.img.style.transform = 'scaleX(-1)';
			item.facing = item.x;
		}
	}

	function spriteCanvas(item) {
		if (item.canvas) {
			return item.canvas;
		}
		var naturalWidth = Math.max(1, item.img.naturalWidth || 1);
		var naturalHeight = Math.max(1, item.img.naturalHeight || 1);
		var width = Math.max(1, Math.min(naturalWidth, SAMPLE_WIDTH));
		var height = Math.max(1, Math.round(naturalHeight * (width / naturalWidth)));
		var canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = height;
		item.canvas = canvas;
		item.context = canvas.getContext('2d', { willReadFrequently: true });
		item.context.imageSmoothingEnabled = false;
		return canvas;
	}

	function spriteBox(item) {
		try {
			var canvas = spriteCanvas(item);
			var context = item.context;
			var width = canvas.width;
			var height = canvas.height;
			context.clearRect(0, 0, width, height);
			context.drawImage(item.img, 0, 0, width, height);
			var data = context.getImageData(0, 0, width, height).data;
			var minX = width;
			var minY = height;
			var maxX = -1;
			var maxY = -1;
			for (var y = 0; y < height; y += 2) {
				for (var x = 0; x < width; x += 2) {
					if (data[(y * width + x) * 4 + 3] > 8) {
						if (x < minX) { minX = x; }
						if (x > maxX) { maxX = x; }
						if (y < minY) { minY = y; }
						if (y > maxY) { maxY = y; }
					}
				}
			}
			if (maxX < 0 || maxY < 0) {
				return null;
			}
			var pad = 0.06;
			return {
				left: clamp(minX / width - pad, 0, 1),
				top: clamp(minY / height - pad, 0, 1),
				right: clamp((maxX + 1) / width + pad, 0, 1),
				bottom: clamp((maxY + 1) / height + pad, 0, 1)
			};
		} catch (error) {
			return null;
		}
	}

	function clipToSprite(item) {
		var box = item.box;
		if (!box) { return; }
		item.hit.style.clipPath = 'inset(' +
			box.top * 100 + '% ' +
			(1 - box.right) * 100 + '% ' +
			(1 - box.bottom) * 100 + '% ' +
			box.left * 100 + '%)';
	}

	function unionBox(current, next) {
		if (!current) { return next; }
		if (!next) { return current; }
		return {
			left: Math.min(current.left, next.left),
			top: Math.min(current.top, next.top),
			right: Math.max(current.right, next.right),
			bottom: Math.max(current.bottom, next.bottom)
		};
	}

	function sampleSprite(item) {
		var box = spriteBox(item);
		if (!box) { return; }
		var union = unionBox(item.box, box);
		var changed = !item.box ||
			union.left < item.box.left ||
			union.top < item.box.top ||
			union.right > item.box.right ||
			union.bottom > item.box.bottom;
		if (!changed) { return; }
		item.box = union;
		clipToSprite(item);
		place(item);
	}

	function trackSprite(item) {
		var tick = 0;
		function step() {
			if (tick >= SAMPLE_TICKS) { return; }
			tick += 1;
			sampleSprite(item);
			window.requestAnimationFrame(step);
		}
		window.requestAnimationFrame(step);
	}

	function relayout() {
		items.forEach(function (item) {
			if (!item.hidden) {
				place(item);
			}
		});
	}

	function setLocked(item, locked) {
		item.locked = locked;
		item.el.classList.toggle('locked', locked);
		item.el.title = locked
			? 'locked in place - right-click to set free'
			: 'right-click to lock in place, scroll to resize';
	}

	function setHidden(item, hidden) {
		item.hidden = hidden;
		item.el.classList.toggle('umadance-hidden', hidden);
		if (!hidden) {
			place(item);
		}
	}

	function resize(item, bigger) {
		item.size = clamp(Math.round(item.size * (bigger ? 1 + SIZE_STEP : 1 - SIZE_STEP)), MIN_SIZE, MAX_SIZE);
		item.img.style.height = item.size + 'px';
		place(item);
		writeSaved();
	}

	function bindItem(item) {
		var offsetX = 0;
		var offsetY = 0;

		item.el.addEventListener('pointerdown', function (event) {
			if (item.locked || event.button !== 0) { return; }
			offsetX = event.clientX - item.x * window.innerWidth;
			offsetY = event.clientY - item.y * window.innerHeight;
			item.dragging = true;
			item.el.classList.add('dragging');
			item.hit.setPointerCapture(event.pointerId);
			event.preventDefault();
			event.stopPropagation();
		});

		item.el.addEventListener('pointermove', function (event) {
			if (!item.dragging) { return; }
			item.x = clamp((event.clientX - offsetX) / window.innerWidth, 0, 1);
			item.y = clamp((event.clientY - offsetY) / window.innerHeight, 0, 1);
			place(item);
			event.preventDefault();
		});

		function endDrag(event) {
			if (!item.dragging) { return; }
			item.dragging = false;
			item.el.classList.remove('dragging');
			if (item.hit.hasPointerCapture(event.pointerId)) {
				item.hit.releasePointerCapture(event.pointerId);
			}
			writeSaved();
		}

		item.el.addEventListener('pointerup', endDrag);
		item.el.addEventListener('pointercancel', endDrag);

		item.el.addEventListener('contextmenu', function (event) {
			event.preventDefault();
			event.stopPropagation();
			setLocked(item, !item.locked);
			writeSaved();
		});

		item.el.addEventListener('wheel', function (event) {
			if (item.locked || item.dragging) { return; }
			event.preventDefault();
			event.stopPropagation();
			resize(item, event.deltaY < 0);
		}, { passive: false });
	}

	function createItem(name) {
		var stored = saved[name];
		var hasSpot = stored && typeof stored.x === 'number' && typeof stored.y === 'number';
		var spot = hasSpot ? { x: clamp(stored.x, 0, 1), y: clamp(stored.y, 0, 1) } : randomSpot();
		var size = stored && typeof stored.size === 'number'
			? clamp(Math.round(stored.size), MIN_SIZE, MAX_SIZE)
			: DEFAULT_SIZE;
		var el = document.createElement('div');
		el.className = 'umadance-uma';
		var hit = document.createElement('div');
		hit.className = 'umadance-hit';
		el.appendChild(hit);
		var img = document.createElement('img');
		img.src = ASSET_DIR + name;
		img.alt = '';
		img.draggable = false;
		img.style.height = size + 'px';
		el.appendChild(img);
		var item = {
			name: name,
			label: label(name),
			el: el,
			hit: hit,
			img: img,
			size: size,
			x: spot.x,
			y: spot.y,
			facing: spot.x,
			box: null,
			locked: Boolean(stored && stored.locked === true),
			hidden: Boolean(stored && stored.hidden === true),
			dragging: false
		};
		setLocked(item, item.locked);
		bindItem(item);
		img.addEventListener('load', function () {
			sampleSprite(item);
			trackSprite(item);
		});
		root.appendChild(el);
		items.push(item);
		return item;
	}

	function moveMenu(left, top) {
		var maxLeft = Math.max(0, window.innerWidth - menu.offsetWidth);
		var maxTop = Math.max(0, window.innerHeight - menu.offsetHeight);
		menu.style.left = clamp(left, 0, maxLeft) + 'px';
		menu.style.top = clamp(top, 0, maxTop) + 'px';
		menu.style.right = 'auto';
	}

	function applyMenuPosition() {
		var raw = readStored(MENU_KEY);
		var position = null;
		if (raw) {
			try {
				position = JSON.parse(raw);
			} catch (error) {
				position = null;
			}
		}
		if (position && typeof position.left === 'number' && typeof position.top === 'number') {
			moveMenu(position.left, position.top);
			return;
		}
		moveMenu(window.innerWidth - MENU_WIDTH - 24, 72);
	}

	function bindMenuDrag(bar) {
		var startX = 0;
		var startY = 0;
		var startLeft = 0;
		var startTop = 0;

		bar.addEventListener('pointerdown', function (event) {
			if (event.button !== 0) { return; }
			startX = event.clientX;
			startY = event.clientY;
			startLeft = parseFloat(menu.style.left) || 0;
			startTop = parseFloat(menu.style.top) || 0;
			menu.classList.add('umadance-dragging');
			bar.setPointerCapture(event.pointerId);
			event.preventDefault();
		});

		bar.addEventListener('pointermove', function (event) {
			if (!menu.classList.contains('umadance-dragging')) { return; }
			moveMenu(startLeft + event.clientX - startX, startTop + event.clientY - startY);
			event.preventDefault();
		});

		function endDrag(event) {
			if (!menu.classList.contains('umadance-dragging')) { return; }
			menu.classList.remove('umadance-dragging');
			if (bar.hasPointerCapture(event.pointerId)) {
				bar.releasePointerCapture(event.pointerId);
			}
			store(MENU_KEY, JSON.stringify({
				left: Math.round(parseFloat(menu.style.left) || 0),
				top: Math.round(parseFloat(menu.style.top) || 0)
			}));
		}

		bar.addEventListener('pointerup', endDrag);
		bar.addEventListener('pointercancel', endDrag);
	}

	function buildMenu() {
		menu = document.createElement('div');
		menu.id = 'umadance-menu';
		menu.classList.add('umadance-off');
		var bar = document.createElement('div');
		bar.className = 'umadance-bar';
		var title = document.createElement('span');
		title.className = 'umadance-title';
		title.textContent = 'umadance';
		bar.appendChild(title);
		var list = document.createElement('div');
		list.className = 'umadance-list';
		var masterRow = document.createElement('label');
		masterRow.className = 'umadance-row umadance-master';
		masterBox = document.createElement('input');
		masterBox.type = 'checkbox';
		masterBox.autocomplete = 'off';
		masterBox.checked = !isMasterHidden();
		masterBox.addEventListener('click', function (event) {
			event.stopPropagation();
			toggleMasterHidden();
			masterBox.checked = !isMasterHidden();
		});
		var masterText = document.createElement('span');
		masterText.textContent = MASTER_LABEL;
		masterRow.appendChild(masterBox);
		masterRow.appendChild(masterText);
		list.appendChild(masterRow);
		menuList = list;
		items.forEach(function (item) {
			list.appendChild(createRow(item));
		});
		menu.appendChild(bar);
		menu.appendChild(list);
		document.body.appendChild(menu);
		menu.addEventListener('animationend', function (event) {
			if (event.animationName !== 'umadance-menu-out') { return; }
			menu.classList.remove('umadance-out');
			menu.classList.add('umadance-off');
		});
		bindMenuDrag(bar);
		applyMenuPosition();
		syncMenu();
		window.setTimeout(syncMenu, 500);
	}

	function syncMenu() {
		items.forEach(function (item) {
			if (item.checkbox) {
				item.checkbox.checked = !item.hidden;
			}
		});
	}

	function createRow(item) {
		var row = document.createElement('label');
		row.className = 'umadance-row';
		var box = document.createElement('input');
		box.type = 'checkbox';
		box.autocomplete = 'off';
		box.checked = !item.hidden;
		box.addEventListener('click', function (event) {
			event.stopPropagation();
			setHidden(item, !item.hidden);
			box.checked = !item.hidden;
			popBox(box, box.checked);
			writeSaved();
		});
		var text = document.createElement('span');
		text.textContent = item.label;
		row.appendChild(box);
		row.appendChild(text);
		item.checkbox = box;
		item.row = row;
		return row;
	}

	function popBox(box, checked) {
		if (!box.umadancePop) {
			box.umadancePop = true;
			box.addEventListener('animationend', function () {
				box.classList.remove('umadance-pop-in', 'umadance-pop-out');
			});
		}
		box.classList.remove('umadance-pop-in', 'umadance-pop-out');
		void box.offsetWidth;
		box.classList.add(checked ? 'umadance-pop-in' : 'umadance-pop-out');
	}

	function destroyItem(item) {
		item.el.remove();
		if (item.row) {
			item.row.remove();
		}
		var index = items.indexOf(item);
		if (index !== -1) {
			items.splice(index, 1);
		}
		delete saved[item.name];
		writeSaved();
	}

	function syncAssets(list) {
		items.slice().forEach(function (item) {
			if (list.indexOf(item.name) === -1) {
				destroyItem(item);
			}
		});
		list.forEach(function (name) {
			var known = items.some(function (item) {
				return item.name === name;
			});
			if (known) { return; }
			var item = createItem(name);
			item.el.classList.add('umadance-hidden');
			if (!item.hidden) {
				window.requestAnimationFrame(function () {
					window.requestAnimationFrame(function () {
						item.el.classList.remove('umadance-hidden');
					});
				});
			}
			if (menuList) {
				menuList.appendChild(createRow(item));
			}
		});
		syncMenu();
		relayout();
	}

	function watchAssets() {
		function applyManifest() {
			var next = Array.isArray(window.__umadanceAssets) ? window.__umadanceAssets.slice().sort() : [];
			if (next.join('|') === names.join('|')) { return; }
			names = next;
			syncAssets(names);
		}

		function probe(url) {
			if (!document.head) { return; }
			var script = document.createElement('script');
			script.src = url;
			script.addEventListener('load', function () {
				script.remove();
				applyManifest();
			});
			script.addEventListener('error', function () {
				script.remove();
				if (url !== ASSET_MANIFEST) {
					probe(ASSET_MANIFEST);
				}
			});
			document.head.appendChild(script);
		}

		window.setInterval(function () {
			probe(ASSET_MANIFEST + '?t=' + Date.now());
		}, ASSET_POLL_MS);
	}

	function setMenuOpen(open) {
		menu.classList.remove('umadance-in', 'umadance-out');
		if (open) {
			menu.classList.remove('umadance-off');
			if (!reduceMotion.matches) {
				menu.classList.add('umadance-in');
			}
			return;
		}
		if (reduceMotion.matches) {
			menu.classList.add('umadance-off');
			return;
		}
		menu.classList.add('umadance-out');
	}

	function toggleMenu() {
		setMenuOpen(menu.classList.contains('umadance-off') || menu.classList.contains('umadance-out'));
	}

	function isMasterHidden() {
		return readStored(MASTER_KEY) !== '0';
	}

	function applyMasterHidden(hidden) {
		if (root) {
			root.classList.toggle('umadance-hidden', hidden);
		}
	}

	function toggleMasterHidden() {
		var hidden = !isMasterHidden();
		store(MASTER_KEY, hidden ? '1' : '0');
		applyMasterHidden(hidden);
		if (masterBox) {
			masterBox.checked = !hidden;
			popBox(masterBox, masterBox.checked);
		}
	}

	function keepAttached() {
		if (!document.body) { return; }
		if (root && !root.isConnected) {
			document.body.appendChild(root);
		}
		if (menu && !menu.isConnected) {
			document.body.appendChild(menu);
		}
	}

	window.addEventListener('keydown', function (event) {
		if (event.shiftKey) { return; }
		var key = String(event.key).toLowerCase();
		if (key === MENU_TOGGLE) {
			event.preventDefault();
			event.stopImmediatePropagation();
			if (menu) {
				toggleMenu();
			}
			return;
		}
		if (!event.ctrlKey || !event.altKey || key !== MASTER_TOGGLE) { return; }
		event.preventDefault();
		event.stopImmediatePropagation();
		toggleMasterHidden();
	}, true);

	function attach() {
		if (root && root.isConnected) {
			return true;
		}
		if (!document.body) {
			return false;
		}
		root = document.createElement('div');
		root.id = 'umadance-overlay';
		document.body.appendChild(root);
		names.forEach(createItem);
		buildMenu();
		items.forEach(function (item) {
			setHidden(item, item.hidden);
		});
		relayout();
		applyMasterHidden(isMasterHidden());
		var entering = items.filter(function (item) {
			return !item.hidden;
		});
		entering.forEach(function (item) {
			item.el.classList.add('umadance-hidden');
		});
		window.requestAnimationFrame(function () {
			entering.forEach(function (item, index) {
				window.setTimeout(function () {
					item.el.classList.remove('umadance-hidden');
				}, 45 * index);
			});
		});
		window.addEventListener('resize', relayout);
		window.addEventListener('resize', applyMenuPosition);
		window.setInterval(keepAttached, 3000);
		watchAssets();
		window.addEventListener('beforeunload', writeSaved);
		return true;
	}

	function boot() {
		if (attach()) { return; }
		window.setTimeout(boot, 200);
	}

	boot();
})();
