(function () {
	'use strict';

	var ASSET_DIR = './uma/';
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

	var names = Array.isArray(window.__umadanceAssets) ? window.__umadanceAssets.slice() : [];
	if (names.length === 0) {
		return;
	}

	var items = [];
	var root = null;
	var menu = null;
	var masterBox = null;
	var saved = readSaved();

	function clamp(value, min, max) {
		if (value < min) { return min; }
		if (value > max) { return max; }
		return value;
	}

	function label(name) {
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
		var rect = item.el.getBoundingClientRect();
		var width = window.innerWidth;
		var height = window.innerHeight;
		var box = item.box || { left: 0, top: 0, right: 1, bottom: 1 };
		var halfWidth = ((box.right - box.left) * rect.width) / 2 + 4;
		var halfHeight = ((box.bottom - box.top) * rect.height) / 2 + 4;
		var centerX = (box.left + box.right) / 2 - 0.5;
		var centerY = (box.top + box.bottom) / 2 - 0.5;
		var facing = item.x >= item.facing ? 1 : -1;
		item.el.style.left = clamp(item.x * width - centerX * rect.width, halfWidth, Math.max(halfWidth, width - halfWidth)) + 'px';
		item.el.style.top = clamp(item.y * height - centerY * rect.height, halfHeight, Math.max(halfHeight, height - halfHeight)) + 'px';
		item.img.style.transform = 'scaleX(' + facing + ')';
		item.facing = item.x;
	}

	function spriteBox(img) {
		try {
			var width = Math.min(img.naturalWidth, 160);
			var height = Math.max(1, Math.round(img.naturalHeight * (width / img.naturalWidth)));
			var canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			var context = canvas.getContext('2d');
			context.drawImage(img, 0, 0, width, height);
			var data = context.getImageData(0, 0, width, height).data;
			var minX = width;
			var minY = height;
			var maxX = -1;
			var maxY = -1;
			for (var y = 0; y < height; y += 1) {
				for (var x = 0; x < width; x += 1) {
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
			var pad = 0.05;
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
		item.el.style.clipPath = 'inset(' +
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
		var box = spriteBox(item.img);
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
		item.el.style.display = hidden ? 'none' : '';
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
			var rect = item.el.getBoundingClientRect();
			offsetX = event.clientX - (rect.left + rect.width / 2);
			offsetY = event.clientY - (rect.top + rect.height / 2);
			item.dragging = true;
			item.el.classList.add('dragging');
			item.el.setPointerCapture(event.pointerId);
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
			if (item.el.hasPointerCapture(event.pointerId)) {
				item.el.releasePointerCapture(event.pointerId);
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
			if (item.locked) { return; }
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
			var samples = 0;
			var timer = window.setInterval(function () {
				samples += 1;
				sampleSprite(item);
				if (samples >= 16) {
					window.clearInterval(timer);
				}
			}, 220);
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
		var offsetX = 0;
		var offsetY = 0;

		bar.addEventListener('pointerdown', function (event) {
			if (event.button !== 0) { return; }
			var rect = menu.getBoundingClientRect();
			offsetX = event.clientX - rect.left;
			offsetY = event.clientY - rect.top;
			menu.classList.add('umadance-dragging');
			bar.setPointerCapture(event.pointerId);
			event.preventDefault();
		});

		bar.addEventListener('pointermove', function (event) {
			if (!menu.classList.contains('umadance-dragging')) { return; }
			moveMenu(event.clientX - offsetX, event.clientY - offsetY);
			event.preventDefault();
		});

		function endDrag(event) {
			if (!menu.classList.contains('umadance-dragging')) { return; }
			menu.classList.remove('umadance-dragging');
			if (bar.hasPointerCapture(event.pointerId)) {
				bar.releasePointerCapture(event.pointerId);
			}
			var rect = menu.getBoundingClientRect();
			store(MENU_KEY, JSON.stringify({ left: Math.round(rect.left), top: Math.round(rect.top) }));
		}

		bar.addEventListener('pointerup', endDrag);
		bar.addEventListener('pointercancel', endDrag);
	}

	function buildMenu() {
		menu = document.createElement('div');
		menu.id = 'umadance-menu';
		var bar = document.createElement('div');
		bar.className = 'umadance-bar';
		var title = document.createElement('span');
		title.className = 'umadance-title';
		title.textContent = 'umadance';
		var hint = document.createElement('span');
		hint.className = 'umadance-hint';
		hint.textContent = MENU_TOGGLE;
		bar.appendChild(title);
		bar.appendChild(hint);
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
		masterText.textContent = 'uma';
		masterRow.appendChild(masterBox);
		masterRow.appendChild(masterText);
		list.appendChild(masterRow);
		items.forEach(function (item) {
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
				writeSaved();
			});
			var text = document.createElement('span');
			text.textContent = item.label;
			row.appendChild(box);
			row.appendChild(text);
			item.checkbox = box;
			list.appendChild(row);
		});
		menu.appendChild(bar);
		menu.appendChild(list);
		document.body.appendChild(menu);
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

	function toggleMenu() {
		menu.classList.toggle('umadance-off');
	}

	function isMasterHidden() {
		return readStored(MASTER_KEY) !== '0';
	}

	function applyMasterHidden(hidden) {
		if (root) {
			root.style.display = hidden ? 'none' : '';
		}
	}

	function toggleMasterHidden() {
		var hidden = !isMasterHidden();
		store(MASTER_KEY, hidden ? '1' : '0');
		applyMasterHidden(hidden);
		if (masterBox) {
			masterBox.checked = !hidden;
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
		window.addEventListener('resize', relayout);
		window.addEventListener('resize', applyMenuPosition);
		window.setInterval(keepAttached, 3000);
		window.addEventListener('beforeunload', writeSaved);
		return true;
	}

	function boot() {
		if (attach()) { return; }
		window.setTimeout(boot, 200);
	}

	boot();
})();
