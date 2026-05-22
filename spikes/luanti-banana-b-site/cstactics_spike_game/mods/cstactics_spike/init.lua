local core = core or minetest
local MOD = core.get_current_modname()
local MOD_PATH = core.get_modpath(MOD)
local DATA_PATH = MOD_PATH .. "/banana_b_site.json"

local function read_json(path)
  local file = assert(io.open(path, "r"))
  local raw = file:read("*a")
  file:close()
  return assert(core.parse_json(raw))
end

local MAP = read_json(DATA_PATH)
local ORIGIN = MAP.origin or { x = -15, y = 5, z = -15 }
local MOVE_POINTS = MAP.tactical.movePoints or 6
local OBSERVER = {
  tile_x = math.floor(MAP.size.width / 2),
  tile_z = math.floor(MAP.size.depth / 2),
  height = 36,
  yaw = 0,
  pitch = math.rad(84),
}
local state = {
  selected = nil,
  units = {},
  unit_positions = {},
  base_floor = {},
  walkable = {},
  blocked = {},
  move_keys = {},
  path = nil,
}

local function full(name)
  return MOD .. ":" .. name
end

local function tex(color)
  return "[fill:16x16:0,0:" .. color
end

local function key(x, z)
  return x .. "," .. z
end

local function tile_from_key(k)
  local x, z = k:match("^(-?%d+),(-?%d+)$")
  return { x = tonumber(x), z = tonumber(z) }
end

local function in_bounds(x, z)
  return x >= 0 and z >= 0 and x < MAP.size.width and z < MAP.size.depth
end

local function pos_for(x, y, z)
  return { x = ORIGIN.x + x, y = ORIGIN.y + y, z = ORIGIN.z + z }
end

local function tile_from_pos(pos)
  return { x = pos.x - ORIGIN.x, z = pos.z - ORIGIN.z }
end

local function is_walkable(x, z)
  local k = key(x, z)
  return state.walkable[k] and not state.blocked[k]
end

local function clear_table(t)
  for k in pairs(t) do
    t[k] = nil
  end
end

local function neighbors(tile)
  return {
    { x = tile.x + 1, z = tile.z },
    { x = tile.x - 1, z = tile.z },
    { x = tile.x, z = tile.z + 1 },
    { x = tile.x, z = tile.z - 1 },
  }
end

local function compute_range(start, max_steps)
  local queue = { { x = start.x, z = start.z, d = 0 } }
  local seen = { [key(start.x, start.z)] = true }
  local out = {}

  local index = 1
  while queue[index] do
    local current = queue[index]
    index = index + 1
    if current.d > 0 then
      out[key(current.x, current.z)] = true
    end
    if current.d < max_steps then
      for _, next_tile in ipairs(neighbors(current)) do
        local k = key(next_tile.x, next_tile.z)
        if not seen[k] and is_walkable(next_tile.x, next_tile.z) then
          seen[k] = true
          queue[#queue + 1] = { x = next_tile.x, z = next_tile.z, d = current.d + 1 }
        end
      end
    end
  end

  return out
end

local function compute_path(start, goal)
  local start_key = key(start.x, start.z)
  local goal_key = key(goal.x, goal.z)
  local queue = { start }
  local seen = { [start_key] = true }
  local came_from = {}
  local index = 1

  while queue[index] do
    local current = queue[index]
    index = index + 1
    if key(current.x, current.z) == goal_key then
      local path = { goal }
      local cursor = goal_key
      while came_from[cursor] do
        cursor = came_from[cursor]
        path[#path + 1] = tile_from_key(cursor)
      end
      local reversed = {}
      for i = #path, 1, -1 do
        reversed[#reversed + 1] = path[i]
      end
      return reversed
    end
    for _, next_tile in ipairs(neighbors(current)) do
      local k = key(next_tile.x, next_tile.z)
      if not seen[k] and is_walkable(next_tile.x, next_tile.z) then
        seen[k] = true
        came_from[k] = key(current.x, current.z)
        queue[#queue + 1] = next_tile
      end
    end
  end

  return nil
end

local function set_floor(x, z, node_name)
  if in_bounds(x, z) then
    core.set_node(pos_for(x, 0, z), { name = node_name })
  end
end

local function restore_floors()
  for k, node_name in pairs(state.base_floor) do
    local tile = tile_from_key(k)
    set_floor(tile.x, tile.z, node_name)
  end
end

local function render_tactical()
  restore_floors()

  for _, tile in ipairs(MAP.tactical.dangerCone or {}) do
    if state.walkable[key(tile.x, tile.z)] then
      set_floor(tile.x, tile.z, full("danger_floor"))
    end
  end

  clear_table(state.move_keys)
  if state.selected then
    local selected_pos = state.unit_positions[state.selected]
    if selected_pos then
      set_floor(selected_pos.x, selected_pos.z, full("selected_floor"))
      state.move_keys = compute_range(selected_pos, MOVE_POINTS)
      for k in pairs(state.move_keys) do
        local tile = tile_from_key(k)
        set_floor(tile.x, tile.z, full("move_floor"))
      end
    end
  end

  if state.path then
    for _, tile in ipairs(state.path) do
      if state.walkable[key(tile.x, tile.z)] then
        set_floor(tile.x, tile.z, full("path_floor"))
      end
    end
  end
end

local function place_unit(unit)
  local node_name = unit.team == "CT" and full("unit_ct") or full("unit_t")
  local p = pos_for(unit.x, 1, unit.z)
  core.set_node(p, { name = node_name })
  local meta = core.get_meta(p)
  meta:set_string("unit_id", unit.id)
  meta:set_string("infotext", unit.team .. " " .. unit.role .. " (" .. unit.id .. ")")
  state.units[unit.id] = unit
  state.unit_positions[unit.id] = { x = unit.x, z = unit.z }
  state.blocked[key(unit.x, unit.z)] = true
end

local function select_unit(unit_id, player)
  if not state.units[unit_id] then
    return
  end
  state.selected = unit_id
  local initial = MAP.tactical.initialPath
  state.path = unit_id == MAP.tactical.selectedUnit and initial or nil
  render_tactical()
  if player then
    core.chat_send_player(player:get_player_name(), "Selected " .. unit_id .. ". Right-click a cyan tile to move.")
  end
end

local function move_selected_to(goal, player)
  if not state.selected or not state.move_keys[key(goal.x, goal.z)] then
    return
  end
  local unit = state.units[state.selected]
  local from = state.unit_positions[state.selected]
  local path = compute_path(from, goal)
  if not path then
    return
  end

  state.path = path
  render_tactical()

  core.after(0.35, function()
    core.set_node(pos_for(from.x, 1, from.z), { name = "air" })
    state.blocked[key(from.x, from.z)] = nil
    unit.x = goal.x
    unit.z = goal.z
    place_unit(unit)
    state.path = nil
    select_unit(unit.id, player)
  end)
end

local function on_floor_rightclick(pos, node, clicker)
  local tile = tile_from_pos(pos)
  move_selected_to(tile, clicker)
end

local function on_unit_rightclick(pos, node, clicker)
  local meta = core.get_meta(pos)
  select_unit(meta:get_string("unit_id"), clicker)
end

local function register_floor_node(name, color, description)
  core.register_node(full(name), {
    description = description,
    tiles = { tex(color) },
    paramtype = "light",
    sunlight_propagates = true,
    light_source = 6,
    groups = { oddly_breakable_by_hand = 3, cstactics_floor = 1 },
    on_rightclick = on_floor_rightclick,
  })
end

core.register_node(full("tabletop"), {
  description = "Neutral Tabletop",
  tiles = { tex("#B8BBB2") },
  paramtype = "light",
  sunlight_propagates = true,
  light_source = 4,
  groups = { oddly_breakable_by_hand = 3 },
})

register_floor_node("floor", "#EEECE6", "Clay Floor")
register_floor_node("site_b_floor", "#E8DFB9", "B Site Floor")
register_floor_node("spawn_t_floor", "#E7D2D0", "T Setup Floor")
register_floor_node("spawn_ct_floor", "#DCE8F1", "CT Setup Floor")
register_floor_node("selected_floor", "#F6DF45", "Selected Unit")
register_floor_node("move_floor", "#8EEBFF", "Move Range")
register_floor_node("path_floor", "#2A7CFF", "Planned Path")
register_floor_node("danger_floor", "#F06C5E", "Danger / LOS")

core.register_node(full("wall"), {
  description = "Whitebox Wall",
  tiles = { tex("#D5D3CA") },
  paramtype = "light",
  sunlight_propagates = true,
  light_source = 3,
  groups = { cracky = 3 },
})

core.register_node(full("wall_cap"), {
  description = "Whitebox Wall Cap",
  tiles = { tex("#F5F3EC") },
  paramtype = "light",
  sunlight_propagates = true,
  light_source = 4,
  groups = { cracky = 3 },
})

local function register_box_node(name, color, description, boxes)
  core.register_node(full(name), {
    description = description,
    drawtype = "nodebox",
    paramtype = "light",
    tiles = { tex(color) },
    sunlight_propagates = true,
    light_source = 4,
    node_box = { type = "fixed", fixed = boxes },
    selection_box = { type = "fixed", fixed = boxes },
    groups = { cracky = 3 },
  })
end

core.register_tool(full("selector"), {
  description = "CS2 Tactics Long-Range Selector",
  inventory_image = tex("#FFFFFF00"),
  wield_image = tex("#FFFFFF00"),
  range = 128,
})

register_box_node("crate", "#B7B0A3", "Clay Crate", {
  { -0.45, -0.5, -0.45, 0.45, 0.42, 0.45 },
  { -0.5, 0.42, -0.5, 0.5, 0.5, 0.5 },
})
register_box_node("sandbag", "#C8C0B2", "Sandbags", {
  { -0.5, -0.5, -0.45, 0.5, -0.18, -0.05 },
  { -0.5, -0.18, -0.35, 0.5, 0.12, 0.08 },
  { -0.5, 0.12, -0.42, 0.5, 0.36, -0.02 },
})
register_box_node("barrel", "#AFA89D", "Barrel / Logs", {
  { -0.28, -0.5, -0.5, 0.28, 0.28, 0.5 },
  { -0.36, -0.36, -0.42, 0.36, 0.12, 0.42 },
})
register_box_node("fountain", "#DFDDD5", "B Fountain", {
  { -0.5, -0.5, -0.5, 0.5, -0.1, 0.5 },
  { -0.32, -0.1, -0.32, 0.32, 0.34, 0.32 },
  { -0.12, 0.34, -0.12, 0.12, 0.5, 0.12 },
})
register_box_node("coffin", "#B9B3A7", "Coffins", {
  { -0.42, -0.5, -0.5, 0.42, 0.24, 0.5 },
})
register_box_node("orange", "#C5B894", "Oranges Stack", {
  { -0.42, -0.5, -0.42, 0.42, 0.1, 0.42 },
  { -0.34, 0.1, -0.34, 0.34, 0.5, 0.34 },
})
register_box_node("b_marker", "#C77B70", "B Marker", {
  { -0.5, -0.5, -0.5, 0.5, -0.1, 0.5 },
})
register_box_node("unit_t", "#D83A32", "T Unit", {
  { -0.32, -0.5, -0.32, 0.32, -0.32, 0.32 },
  { -0.22, -0.32, -0.2, 0.22, 0.22, 0.2 },
  { -0.18, 0.22, -0.18, 0.18, 0.5, 0.18 },
})
register_box_node("unit_ct", "#1764D8", "CT Unit", {
  { -0.34, -0.5, -0.34, 0.34, -0.32, 0.34 },
  { -0.24, -0.32, -0.2, 0.24, 0.22, 0.2 },
  { -0.2, 0.22, -0.2, 0.2, 0.5, 0.2 },
})

core.override_item(full("unit_t"), { on_rightclick = on_unit_rightclick })
core.override_item(full("unit_ct"), { on_rightclick = on_unit_rightclick })

local floor_nodes = {
  floor = full("floor"),
  site_b = full("site_b_floor"),
  spawn_t = full("spawn_t_floor"),
  spawn_ct = full("spawn_ct_floor"),
}

local prop_nodes = {
  crate = full("crate"),
  sandbag = full("sandbag"),
  barrel = full("barrel"),
  fountain = full("fountain"),
  coffin = full("coffin"),
  orange = full("orange"),
  b_marker = full("b_marker"),
}

local function each_rect(rect, cb)
  for x = rect.x, rect.x + rect.w - 1 do
    for z = rect.z, rect.z + rect.d - 1 do
      cb(x, z)
    end
  end
end

local function place_spike_map()
  state.selected = nil
  state.path = nil
  clear_table(state.units)
  clear_table(state.unit_positions)
  clear_table(state.base_floor)
  clear_table(state.walkable)
  clear_table(state.blocked)
  clear_table(state.move_keys)

  for x = -4, MAP.size.width + 4 do
    for z = -4, MAP.size.depth + 4 do
      for y = 0, 8 do
        core.set_node(pos_for(x, y, z), { name = "air" })
      end
    end
  end

  for x = -4, MAP.size.width + 4 do
    for z = -4, MAP.size.depth + 4 do
      core.set_node(pos_for(x, 0, z), { name = full("tabletop") })
    end
  end

  for _, rect in ipairs(MAP.floors) do
    local node_name = floor_nodes[rect.surface] or floor_nodes.floor
    each_rect(rect, function(x, z)
      local k = key(x, z)
      state.walkable[k] = true
      state.base_floor[k] = node_name
      set_floor(x, z, node_name)
    end)
  end

  for _, wall in ipairs(MAP.walls) do
    each_rect(wall, function(x, z)
      state.blocked[key(x, z)] = true
      for y = 1, wall.h do
        core.set_node(pos_for(x, y, z), { name = y == wall.h and full("wall_cap") or full("wall") })
      end
    end)
  end

  for _, prop in ipairs(MAP.props) do
    local node_name = prop_nodes[prop.type] or prop_nodes.crate
    each_rect(prop, function(x, z)
      state.blocked[key(x, z)] = true
      for y = 1, prop.h or 1 do
        core.set_node(pos_for(x, y, z), { name = node_name })
      end
    end)
  end

  for _, unit in ipairs(MAP.units) do
    place_unit({
      id = unit.id,
      team = unit.team,
      role = unit.role,
      x = unit.x,
      z = unit.z,
      facing = unit.facing,
    })
  end

  select_unit(MAP.tactical.selectedUnit)
end

local function safe_call(method, target, value)
  if target and target[method] then
    pcall(function()
      target[method](target, value)
    end)
  end
end

local function apply_observer_view(player, quiet)
  local pos = pos_for(OBSERVER.tile_x, OBSERVER.height, OBSERVER.tile_z)
  player:set_pos(pos)
  player:set_look_horizontal(OBSERVER.yaw)
  player:set_look_vertical(OBSERVER.pitch)
  player:set_physics_override({
    speed = 0,
    jump = 0,
    gravity = 0,
    sneak = false,
  })
  player:hud_set_flags({
    hotbar = false,
    healthbar = false,
    breathbar = false,
    wielditem = false,
    minimap = false,
    minimap_radar = false,
    crosshair = true,
  })

  safe_call("set_fov", player, 82)
  safe_call("set_clouds", player, { density = 0 })
  safe_call("set_sun", player, { visible = false })
  safe_call("set_moon", player, { visible = false })
  safe_call("set_stars", player, { visible = false })
  if player.set_sky then
    pcall(function()
      player:set_sky({
        type = "plain",
        base_color = "#D6D8D1",
        clouds = false,
      })
    end)
  end

  local inv = player:get_inventory()
  if inv then
    inv:set_size("main", 1)
    inv:set_stack("main", 1, full("selector"))
    if player.set_wield_index then
      player:set_wield_index(1)
    end
  end

  if not quiet then
    core.chat_send_player(player:get_player_name(), "CS2 Tactics Luanti spike view reset. Aim the crosshair and right-click a unit or cyan tile.")
  end
end

local function apply_free_view(player)
  player:set_physics_override({
    speed = 1,
    jump = 1,
    gravity = 1,
    sneak = true,
  })
  player:hud_set_flags({
    hotbar = true,
    healthbar = true,
    breathbar = true,
    wielditem = true,
    minimap = true,
    minimap_radar = true,
    crosshair = true,
  })
  safe_call("set_fov", player, 0)
  core.chat_send_player(player:get_player_name(), "Free Luanti camera restored. Use /cs_spike_view to return to the tactical overhead view.")
end

core.register_chatcommand("cs_spike_reset", {
  description = "Regenerate the CS2 Tactics Banana/B-site visual spike.",
  func = function(name)
    place_spike_map()
    local player = core.get_player_by_name(name)
    if player then
      apply_observer_view(player, true)
    end
    return true, "CS2 Tactics Luanti spike regenerated."
  end,
})

core.register_chatcommand("cs_spike_view", {
  description = "Reset to the clean tactical overhead view.",
  func = function(name)
    local player = core.get_player_by_name(name)
    if player then
      apply_observer_view(player)
      return true, "Tactical overhead view restored."
    end
    return false, "Player not found."
  end,
})

core.register_chatcommand("cs_spike_free", {
  description = "Restore normal Luanti movement and HUD for debugging.",
  func = function(name)
    local player = core.get_player_by_name(name)
    if player then
      apply_free_view(player)
      return true, "Free camera restored."
    end
    return false, "Player not found."
  end,
})

core.register_chatcommand("cs_spike_help", {
  description = "Show CS2 Tactics Luanti spike controls.",
  func = function(name)
    return true, "Default view is a fixed overhead tactical camera. Aim the crosshair and right-click red/blue units to select; right-click cyan tiles to move. Yellow marks selected, blue marks path, red marks danger/LOS. /cs_spike_view restores the clean view. /cs_spike_reset rebuilds the board."
  end,
})

core.register_on_joinplayer(function(player)
  core.after(0.25, function()
    apply_observer_view(player, true)
    core.chat_send_player(player:get_player_name(), "CS2 Tactics Luanti spike: fixed overhead view loaded. Right-click a unit, then a cyan move tile. Use /cs_spike_help.")
  end)
end)

core.after(0, place_spike_map)
