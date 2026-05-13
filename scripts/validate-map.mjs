import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import ts from 'typescript';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const require = createRequire(import.meta.url);
const root = path.resolve(__dirname, '..');
const infernoPath = path.join(root, 'src', 'game', 'maps', 'inferno.ts');
const outputDir = path.join(root, 'public', 'debug');
const outputPath = path.join(outputDir, 'inferno-map.svg');
const outputPngPath = path.join(outputDir, 'inferno-map.png');

function loadInfernoMap() {
  const cache = new Map();

  function loadTsModule(modulePath) {
    const absolutePath = path.resolve(modulePath);
    if (cache.has(absolutePath)) return cache.get(absolutePath).exports;

    const source = fs.readFileSync(absolutePath, 'utf8');
    const js = ts.transpileModule(source, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
    }).outputText;

    const module = { exports: {} };
    cache.set(absolutePath, module);

    const localRequire = (specifier) => {
      if (!specifier.startsWith('.')) return require(specifier);

      const basePath = path.resolve(path.dirname(absolutePath), specifier);
      const candidates = [
        basePath,
        `${basePath}.ts`,
        `${basePath}.tsx`,
        `${basePath}.js`,
        path.join(basePath, 'index.ts'),
      ];
      const resolved = candidates.find((candidate) => fs.existsSync(candidate));

      if (!resolved) {
        throw new Error(`Cannot resolve ${specifier} from ${absolutePath}`);
      }

      if (resolved.endsWith('.ts') || resolved.endsWith('.tsx')) {
        return loadTsModule(resolved);
      }

      return require(resolved);
    };

    const sandbox = {
      exports: module.exports,
      module,
      require: localRequire,
      console,
    };
    vm.createContext(sandbox);
    vm.runInContext(js, sandbox, { filename: absolutePath });
    return module.exports;
  }

  return loadTsModule(infernoPath).createInfernoMap();
}

function tileKey(x, y) {
  return `${x},${y}`;
}

const DIRS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

function getConnectedComponents(map) {
  const seen = new Set();
  const components = [];

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.grid[y]?.[x];
      const startKey = tileKey(x, y);
      if (!tile?.walkable || seen.has(startKey)) continue;

      const queue = [{ x, y }];
      const labels = new Map();
      seen.add(startKey);
      let size = 0;

      while (queue.length > 0) {
        const current = queue.shift();
        size++;
        const label = map.grid[current.y][current.x].label || 'unlabeled';
        labels.set(label, (labels.get(label) || 0) + 1);

        for (const [dx, dy] of DIRS) {
          const nx = current.x + dx;
          const ny = current.y + dy;
          const nextKey = tileKey(nx, ny);
          if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
          if (seen.has(nextKey)) continue;
          if (!map.grid[ny]?.[nx]?.walkable) continue;

          seen.add(nextKey);
          queue.push({ x: nx, y: ny });
        }
      }

      components.push({
        size,
        labels: [...labels.entries()].sort((a, b) => b[1] - a[1]),
      });
    }
  }

  return components.sort((a, b) => b.size - a.size);
}

function tilesInBox(map, box) {
  const tiles = [];
  for (let y = box.min.y; y <= box.max.y; y++) {
    for (let x = box.min.x; x <= box.max.x; x++) {
      if (map.grid[y]?.[x]?.walkable) tiles.push({ x, y });
    }
  }
  return tiles;
}

function tilesWithLabel(map, label) {
  const tiles = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.grid[y]?.[x];
      if (tile?.walkable && tile.label === label) tiles.push({ x, y });
    }
  }
  return tiles;
}

function tilesAdjacentToCover(map, label) {
  const coverObjects = map.coverObjects.filter((cover) => cover.label === label);
  const adjacent = new Map();

  for (const cover of coverObjects) {
    for (let y = cover.y; y < cover.y + cover.height; y++) {
      for (let x = cover.x; x < cover.x + cover.width; x++) {
        for (const [dx, dy] of DIRS) {
          const nx = x + dx;
          const ny = y + dy;
          const tile = map.grid[ny]?.[nx];
          if (!tile?.walkable) continue;
          adjacent.set(tileKey(nx, ny), { x: nx, y: ny });
        }
      }
    }
  }

  return [...adjacent.values()];
}

function shortestPath(map, start, goals) {
  const goalKeys = new Set(goals.map((goal) => tileKey(goal.x, goal.y)));
  const startKey = tileKey(start.x, start.y);
  const queue = [{ ...start, d: 0, path: [start] }];
  const seen = new Set([startKey]);

  while (queue.length > 0) {
    const current = queue.shift();
    if (goalKeys.has(tileKey(current.x, current.y))) {
      return { distance: current.d, path: current.path };
    }

    for (const [dx, dy] of DIRS) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const key = tileKey(nx, ny);
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
      if (seen.has(key)) continue;
      if (!map.grid[ny]?.[nx]?.walkable) continue;

      seen.add(key);
      queue.push({
        x: nx,
        y: ny,
        d: current.d + 1,
        path: [...current.path, { x: nx, y: ny }],
      });
    }
  }

  return { distance: null, path: [] };
}

function shortestPathFromAny(map, starts, goals) {
  const startTiles = Array.isArray(starts) ? starts : [starts];
  let best = { distance: null, path: [] };

  for (const start of startTiles) {
    if (!start || !map.grid[start.y]?.[start.x]?.walkable) continue;
    const route = shortestPath(map, start, goals);
    if (route.distance === null) continue;
    if (best.distance === null || route.distance < best.distance) best = route;
  }

  return best;
}

const TILE_COLORS = {
  floor: '#57606f',
  wall: '#161820',
  cover_half: '#b7a46c',
  cover_full: '#8b7b57',
  bombsite_a: '#8b3d3d',
  bombsite_b: '#8b3d3d',
  spawn_t: '#b89236',
  spawn_ct: '#315d88',
  out_of_bounds: '#07080d',
};

function svgEscape(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function renderSvg(map, routes) {
  const cell = 8;
  const width = map.width * cell;
  const height = map.height * cell;
  const labels = new Map();

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const label = map.grid[y][x].label;
      if (!label) continue;
      const current = labels.get(label) || { x: 0, y: 0, count: 0 };
      current.x += x;
      current.y += y;
      current.count++;
      labels.set(label, current);
    }
  }

  const rects = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.grid[y][x];
      const color = TILE_COLORS[tile.type] || TILE_COLORS.floor;
      const opacity = tile.walkable ? 1 : 0.72;
      rects.push(
        `<rect x="${x * cell}" y="${(map.height - 1 - y) * cell}" width="${cell}" height="${cell}" fill="${color}" opacity="${opacity}"/>`
      );
    }
  }

  const labelText = [...labels.entries()].map(([label, value]) => {
    const x = (value.x / value.count + 0.5) * cell;
    const y = (map.height - 1 - value.y / value.count + 0.5) * cell;
    return `<text x="${x.toFixed(1)}" y="${y.toFixed(1)}" fill="#f4f1df" font-size="9" font-family="Arial, sans-serif" text-anchor="middle" paint-order="stroke" stroke="#08080c" stroke-width="2">${svgEscape(label)}</text>`;
  });

  const routeLines = Object.entries(routes).map(([name, route]) => {
    if (!route.path.length) return '';
    const points = route.path
      .map((p) => `${(p.x + 0.5) * cell},${(map.height - p.y - 0.5) * cell}`)
      .join(' ');
    return `<polyline points="${points}" fill="none" stroke="#51ff8a" stroke-width="2" stroke-opacity="0.55"><title>${svgEscape(name)}: ${route.distance} tiles</title></polyline>`;
  });

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">Inferno map validation silhouette</title>
  <desc id="desc">Generated tile view of the current Inferno map data. T spawn appears near the bottom; CT and sites appear toward the top.</desc>
  <rect width="100%" height="100%" fill="#07080d"/>
  ${rects.join('\n  ')}
  ${routeLines.join('\n  ')}
  ${labelText.join('\n  ')}
</svg>
`;
}

function drawRect(png, x, y, width, height, color) {
  for (let py = y; py < y + height; py++) {
    for (let px = x; px < x + width; px++) {
      if (px < 0 || py < 0 || px >= png.width || py >= png.height) continue;
      const i = (py * png.width + px) * 4;
      png.data[i] = color[0];
      png.data[i + 1] = color[1];
      png.data[i + 2] = color[2];
      png.data[i + 3] = color[3] ?? 255;
    }
  }
}

function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  return [
    Number.parseInt(clean.slice(0, 2), 16),
    Number.parseInt(clean.slice(2, 4), 16),
    Number.parseInt(clean.slice(4, 6), 16),
    255,
  ];
}

function renderPng(map, routes) {
  const cell = 8;
  const png = new PNG({ width: map.width * cell, height: map.height * cell });
  drawRect(png, 0, 0, png.width, png.height, [7, 8, 13, 255]);

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const tile = map.grid[y][x];
      const color = hexToRgb(TILE_COLORS[tile.type] || TILE_COLORS.floor);
      const drawY = (map.height - 1 - y) * cell;
      drawRect(png, x * cell, drawY, cell, cell, color);
    }
  }

  for (const route of Object.values(routes)) {
    for (const point of route.path) {
      const px = Math.floor((point.x + 0.5) * cell);
      const py = Math.floor((map.height - point.y - 0.5) * cell);
      drawRect(png, px - 1, py - 1, 3, 3, [81, 255, 138, 255]);
    }
  }

  return PNG.sync.write(png);
}

function getCoverPlacementWarnings(map) {
  const warnings = [];

  for (const cover of map.coverObjects) {
    const expectedType = cover.coverType === 'half' ? 'cover_half' : 'cover_full';

    for (let y = cover.y; y < cover.y + cover.height; y++) {
      for (let x = cover.x; x < cover.x + cover.width; x++) {
        const tile = map.grid[y]?.[x];
        if (!tile) {
          warnings.push(`${cover.label} includes out-of-bounds tile ${x},${y}.`);
          continue;
        }

        if (tile.type !== expectedType) {
          warnings.push(
            `${cover.label} tile ${x},${y} resolves to ${tile.type}; expected ${expectedType}.`
          );
        }
      }
    }
  }

  return warnings;
}

function getCoverAdjacencyWarnings(map) {
  const warnings = [];
  const bananaCoverLabels = ['Banana Car', 'Logs', 'Sandbags', 'Half Wall'];

  for (const label of bananaCoverLabels) {
    const adjacentTiles = tilesAdjacentToCover(map, label);
    if (adjacentTiles.length < 2) {
      warnings.push(`${label} has only ${adjacentTiles.length} adjacent walkable tile(s).`);
    }
  }

  return warnings;
}

function getRouteSanityWarnings(routes) {
  const warnings = [];
  const distance = (routeName) => routes[routeName]?.distance;
  const expectBefore = (earlier, later, reason) => {
    const earlierDistance = distance(earlier);
    const laterDistance = distance(later);
    if (earlierDistance === null || laterDistance === null) return;
    if (earlierDistance > laterDistance) {
      warnings.push(`${earlier} (${earlierDistance}) should be before ${later} (${laterDistance}): ${reason}.`);
    }
  };

  expectBefore('T_to_Banana_Car', 'T_to_Banana_Logs', 'lower Banana should route around car into logs');
  expectBefore('T_to_Banana_Logs', 'T_to_Banana_Sandbags', 'logs should stage before the top-Banana sandbags pocket');
  expectBefore('T_to_Banana_Sandbags', 'T_to_B', 'sandbags should be reached before the B plant area');
  expectBefore('T_to_Top_Banana', 'T_to_B', 'top Banana should be reached before the B plant area');

  return warnings;
}

function summarize() {
  const map = loadInfernoMap();
  const counts = {};
  let walkable = 0;

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const type = map.grid[y][x].type;
      counts[type] = (counts[type] || 0) + 1;
      if (map.grid[y][x].walkable) walkable++;
    }
  }

  const routeTargets = {
    T_to_A: [map.spawns.T[0], tilesInBox(map, map.plantZones.A)],
    T_to_B: [map.spawns.T[0], tilesInBox(map, map.plantZones.B)],
    CT_to_A: [map.spawns.CT[0], tilesInBox(map, map.plantZones.A)],
    CT_to_B: [map.spawns.CT[0], tilesInBox(map, map.plantZones.B)],
    T_to_Banana_Car: [map.spawns.T, tilesAdjacentToCover(map, 'Banana Car')],
    T_to_Banana_Logs: [map.spawns.T, tilesAdjacentToCover(map, 'Logs')],
    T_to_Banana_Sandbags: [map.spawns.T, tilesAdjacentToCover(map, 'Sandbags')],
    CT_to_Banana_Sandbags: [map.spawns.CT, tilesAdjacentToCover(map, 'Sandbags')],
    Top_Banana_to_B_Site: [tilesWithLabel(map, 'Top Banana'), tilesInBox(map, map.plantZones.B)],
    T_to_Top_Banana: [map.spawns.T[0], tilesWithLabel(map, 'Top Banana')],
    CT_to_Coffins: [map.spawns.CT[0], tilesWithLabel(map, 'Coffins')],
    T_to_A_Short: [map.spawns.T[0], tilesWithLabel(map, 'A Short')],
    CT_to_A_Site: [map.spawns.CT[0], tilesWithLabel(map, 'A Site')],
    T_to_Apartments: [map.spawns.T[0], tilesWithLabel(map, 'Apartments')],
  };

  const routes = Object.fromEntries(
    Object.entries(routeTargets).map(([name, [starts, goals]]) => [
      name,
      shortestPathFromAny(map, starts, goals),
    ])
  );

  const components = getConnectedComponents(map);
  const coverWarnings = getCoverPlacementWarnings(map);
  const coverAdjacencyWarnings = getCoverAdjacencyWarnings(map);
  const routeSanityWarnings = getRouteSanityWarnings(routes);
  const coverAdjacency = Object.fromEntries(
    ['Banana Car', 'Logs', 'Sandbags', 'Half Wall', 'Coffins', 'First Oranges', 'Second Oranges'].map((label) => [
      label,
      tilesAdjacentToCover(map, label).length,
    ])
  );
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, renderSvg(map, routes));
  fs.writeFileSync(outputPngPath, renderPng(map, routes));

  const summary = {
    map: map.name,
    size: `${map.width}x${map.height}`,
    walkableTiles: walkable,
    walkablePercent: Number(((walkable / (map.width * map.height)) * 100).toFixed(1)),
    tileCounts: counts,
    connectedComponents: components.length,
    largestComponents: components.slice(0, 4).map((component) => ({
      size: component.size,
      labels: component.labels.slice(0, 6),
    })),
    routes: Object.fromEntries(
      Object.entries(routes).map(([name, route]) => [name, route.distance])
    ),
    coverAdjacency,
    coverPlacementWarnings: coverWarnings.length,
    coverAdjacencyWarnings: coverAdjacencyWarnings.length,
    routeSanityWarnings: routeSanityWarnings.length,
    output: {
      svg: path.relative(root, outputPath),
      png: path.relative(root, outputPngPath),
    },
  };

  console.log(JSON.stringify(summary, null, 2));

  if (components.length !== 1) {
    console.warn(`Map warning: expected 1 connected walkable component, found ${components.length}.`);
    process.exitCode = 1;
  }

  for (const [name, route] of Object.entries(routes)) {
    if (route.distance === null) {
      console.warn(`Map warning: ${name} has no route.`);
      process.exitCode = 1;
    }
  }

  for (const warning of coverWarnings) {
    console.warn(`Map warning: ${warning}`);
    process.exitCode = 1;
  }

  for (const warning of coverAdjacencyWarnings) {
    console.warn(`Map warning: ${warning}`);
    process.exitCode = 1;
  }

  for (const warning of routeSanityWarnings) {
    console.warn(`Map warning: ${warning}`);
    process.exitCode = 1;
  }
}

summarize();
