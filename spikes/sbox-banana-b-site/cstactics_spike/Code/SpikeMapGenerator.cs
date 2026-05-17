public sealed class SpikeMapGenerator : Component
{
	[Property] public string DataPath { get; set; } = "data/banana_b_site.json";
	[Property] public float TileSize { get; set; } = 48.0f;
	[Property] public bool LockCamera { get; set; } = true;

	private static readonly Model BoxModel = Model.Load( "models/dev/box.vmdl" );
	private static readonly Material DefaultMaterial = Material.Load( "materials/default.vmat" );

	private SpikeMapData data;
	private readonly Dictionary<string, GameObject> unitObjects = new();
	private readonly List<GameObject> generatedObjects = new();
	private readonly List<GameObject> dynamicOverlayObjects = new();
	private readonly List<GameObject> unitVisualObjects = new();
	private readonly HashSet<string> floorTiles = new();
	private readonly HashSet<string> blockedTiles = new();
	private readonly Dictionary<string, SpikePoint> startingUnitPositions = new();
	private Dictionary<string, int> currentMoveRange = new();
	private string selectedUnitId;
	private string hoveredTileKey = "";
	private string statusLine = "Left-click a unit. Hover blue tiles for path. Left-click a blue tile to move.";
	private bool built;

	protected override void OnStart()
	{
		Build();
	}

	protected override void OnUpdate()
	{
		if ( !built || data is null || Scene.Camera is null )
			return;

		Mouse.Visibility = MouseVisibility.Visible;
		Mouse.CursorType = "pointer";

		var hovered = TileUnderMouse();
		var nextHoverKey = hovered is null ? "" : TileKey( hovered.Value.X, hovered.Value.Z );
		if ( nextHoverKey != hoveredTileKey )
		{
			hoveredTileKey = nextHoverKey;
			RenderTacticalOverlays();
		}

		if ( Input.Keyboard.Pressed( "MOUSE1" ) )
			HandleBoardClick( hovered );

		if ( Input.Keyboard.Pressed( "N" ) )
			SelectNextUnit();

		if ( Input.Keyboard.Pressed( "R" ) )
			ResetUnits();
	}

	protected override void OnPreRender()
	{
		if ( !LockCamera || data is null || Scene.Camera is null )
			return;

		var center = BoardCenter();
		Scene.Camera.WorldPosition = center + new Vector3( -560, -820, 760 );
		Scene.Camera.WorldRotation = Rotation.LookAt( center - Scene.Camera.WorldPosition, Vector3.Up );
		Scene.Camera.Orthographic = true;
		Scene.Camera.OrthographicHeight = 1580;

		var overlay = Scene.GetSystem<DebugOverlaySystem>();
		overlay?.ScreenText(
			new Vector2( 18, 18 ),
			$"CS2 Tactics S&box Spike\n{statusLine}\nSelected: {selectedUnitId} | Left-click unit/tile | N next | R reset",
			17,
			TextFlag.LeftTop,
			Color.White
		);
	}

	private void Build()
	{
		if ( built )
			return;

		data = LoadData();
		selectedUnitId = data.Tactical?.SelectedUnit ?? data.Units.FirstOrDefault()?.Id ?? "";
		BuildTileSets();
		Mouse.Visibility = MouseVisibility.Visible;

		CreateBoardBase();
		CreateFloors();
		CreateDangerOverlay();
		CreateWalls();
		CreateProps();
		hoveredTileKey = data.Tactical?.InitialPath.LastOrDefault() is { } destination
			? TileKey( destination.X, destination.Z )
			: "";
		RenderTacticalOverlays();
		RenderUnits();
		CreateLegend();
		SetStatus( "Left-click a unit. Hover blue tiles for path. Left-click a blue tile to move." );

		built = true;
		Log.Info( $"CS2 Tactics S&box Spike: generated {data.Name} ({data.Size.Width}x{data.Size.Depth}) with {data.Units.Count} units." );
	}

	private SpikeMapData LoadData()
	{
		var json = TryReadMountedData();
		if ( string.IsNullOrWhiteSpace( json ) )
			throw new InvalidOperationException( $"Could not load S&box spike data at {DataPath}." );

		var parsed = JsonSerializer.Deserialize<SpikeMapData>( json, new JsonSerializerOptions
		{
			PropertyNameCaseInsensitive = true,
			ReadCommentHandling = JsonCommentHandling.Skip
		} );

		if ( parsed is null )
			throw new InvalidOperationException( "S&box spike data parsed to null." );

		return parsed;
	}

	private string TryReadMountedData()
	{
		try
		{
			if ( FileSystem.Mounted?.FileExists( DataPath ) == true )
				return FileSystem.Mounted.ReadAllText( DataPath );
		}
		catch ( Exception exception )
		{
			Log.Warning( $"Mounted filesystem read failed for {DataPath}: {exception.Message}" );
		}

		return "";
	}

	private void BuildTileSets()
	{
		floorTiles.Clear();
		blockedTiles.Clear();
		startingUnitPositions.Clear();

		foreach ( var floor in data.Floors )
			EachRect( floor, ( x, z ) => floorTiles.Add( TileKey( x, z ) ) );

		foreach ( var wall in data.Walls )
			EachRect( wall, ( x, z ) => blockedTiles.Add( TileKey( x, z ) ) );

		foreach ( var prop in data.Props )
			EachRect( prop, ( x, z ) => blockedTiles.Add( TileKey( x, z ) ) );

		foreach ( var unit in data.Units )
			startingUnitPositions[unit.Id] = new SpikePoint { X = unit.X, Z = unit.Z };
	}

	private void CreateBoardBase()
	{
		var width = data.Size.Width * TileSize;
		var depth = data.Size.Depth * TileSize;
		AddBox( "matte tactical base", BoardCenter() + Vector3.Down * 7, new Vector3( width + 180, depth + 180, 10 ), new Color( 0.72f, 0.72f, 0.68f ) );
	}

	private void CreateFloors()
	{
		foreach ( var floor in data.Floors )
		{
			AddTileRect(
				$"floor {floor.Id}",
				floor.X,
				floor.Z,
				floor.W,
				floor.D,
				8,
				SurfaceColor( floor.Surface ),
				0
			);
		}
	}

	private void CreateDangerOverlay()
	{
		if ( data.Tactical is null )
			return;

		foreach ( var danger in data.Tactical.DangerCone )
			AddTileRect( $"danger {danger.X},{danger.Z}", danger.X, danger.Z, 1, 1, 3, new Color( 0.8f, 0.08f, 0.06f ), 7 );
	}

	private void RenderTacticalOverlays()
	{
		ClearObjects( dynamicOverlayObjects );

		var selected = SelectedUnit();
		if ( selected is null )
			return;

		currentMoveRange = ComputeMoveRange( selected.X, selected.Z, data.Tactical?.MovePoints ?? 6 );

		foreach ( var key in currentMoveRange.Keys )
		{
			var tile = TileFromKey( key );
			if ( tile.X == selected.X && tile.Z == selected.Z )
				continue;

			AddTileRect( $"move {key}", tile.X, tile.Z, 1, 1, 4, new Color( 0.0f, 0.72f, 0.95f ), 14, dynamicOverlayObjects );
		}

		if ( currentMoveRange.ContainsKey( hoveredTileKey ) )
		{
			var hovered = TileFromKey( hoveredTileKey );
			var path = FindPath( selected.X, selected.Z, hovered.X, hovered.Z );
			for ( var i = 0; i < path.Count; i++ )
			{
				var point = path[i];
				AddTileRect( $"path {i:00}", point.X, point.Z, 1, 1, 5, new Color( 0.05f, 0.28f, 1.0f ), 18, dynamicOverlayObjects );
			}
		}

		AddTileRect( $"selected {selected.Id}", selected.X, selected.Z, 1, 1, 6, new Color( 1.0f, 0.9f, 0.05f ), 22, dynamicOverlayObjects );
	}

	private void CreateWalls()
	{
		foreach ( var wall in data.Walls )
		{
			AddTileRect(
				$"wall {wall.Id}",
				wall.X,
				wall.Z,
				wall.W,
				wall.D,
				MathF.Max( wall.H, 1 ) * 42,
				new Color( 0.82f, 0.82f, 0.78f ),
				MathF.Max( wall.H, 1 ) * 21
			);
		}
	}

	private void CreateProps()
	{
		foreach ( var prop in data.Props )
		{
			var height = MathF.Max( prop.H, 1 ) * 28;
			var color = PropColor( prop.Type );
			AddTileRect( $"prop {prop.Id}", prop.X, prop.Z, prop.W, prop.D, height, color, 12 + height * 0.5f );
		}
	}

	private void RenderUnits()
	{
		ClearObjects( unitVisualObjects );
		unitObjects.Clear();

		foreach ( var unit in data.Units )
		{
			var baseColor = unit.Team.Equals( "CT", StringComparison.OrdinalIgnoreCase )
				? new Color( 0.05f, 0.25f, 0.95f )
				: new Color( 0.95f, 0.06f, 0.035f );

			var isSelected = unit.Id == selectedUnitId;
			var pos = TileCenter( unit.X, unit.Z, 42 );
			var marker = AddBox( $"unit {unit.Id} {unit.Role}", pos, new Vector3( 30, 30, isSelected ? 78 : 62 ), baseColor, unitVisualObjects );
			unitObjects[unit.Id] = marker;

			AddBox(
				$"unit cap {unit.Id}",
				pos + Vector3.Up * (isSelected ? 46 : 36),
				new Vector3( isSelected ? 46 : 34, isSelected ? 46 : 34, 8 ),
				isSelected ? new Color( 1.0f, 0.92f, 0.15f ) : Color.White,
				unitVisualObjects
			);

			var facing = new Vector3( unit.Facing.X, unit.Facing.Z, 0 );
			if ( facing.LengthSquared > 0 )
			{
				facing = facing.Normal;
				AddBox( $"facing {unit.Id}", pos + facing * 26 + Vector3.Up * 10, new Vector3( 34, 8, 8 ), Color.White, unitVisualObjects );
			}
		}
	}

	private void CreateLegend()
	{
		var legendX = -data.Size.Width * TileSize * 0.5f - 110;
		var legendY = -data.Size.Depth * TileSize * 0.5f + 72;
		AddBox( "legend blue path", new Vector3( legendX, legendY, 18 ), new Vector3( 42, 42, 8 ), new Color( 0.08f, 0.42f, 0.9f ) );
		AddBox( "legend red danger", new Vector3( legendX, legendY + 60, 18 ), new Vector3( 42, 42, 8 ), new Color( 0.8f, 0.08f, 0.06f ) );
		AddBox( "legend selected", new Vector3( legendX, legendY + 120, 18 ), new Vector3( 42, 42, 8 ), new Color( 1.0f, 0.92f, 0.15f ) );
	}

	private void HandleBoardClick( SpikeTile? clicked )
	{
		if ( clicked is null )
		{
			SetStatus( "Click missed the board. Move the cursor over a unit or a blue reachable tile." );
			return;
		}

		var tile = clicked.Value;
		var clickedUnit = data.Units.FirstOrDefault( unit => unit.X == tile.X && unit.Z == tile.Z );
		if ( clickedUnit is not null )
		{
			selectedUnitId = clickedUnit.Id;
			RenderTacticalOverlays();
			RenderUnits();
			SetStatus( $"Selected {clickedUnit.Id}. Hover a blue tile for path preview, then left-click to move." );
			return;
		}

		var clickedKey = TileKey( tile.X, tile.Z );
		if ( SelectedUnit() is not { } selected )
		{
			SetStatus( "No unit selected. Left-click a red or blue unit first." );
			return;
		}

		if ( !currentMoveRange.ContainsKey( clickedKey ) )
		{
			SetStatus( "That tile is not reachable for the selected unit." );
			return;
		}

		if ( IsOccupiedByOtherUnit( tile.X, tile.Z, selected.Id ) )
		{
			SetStatus( "That tile is already occupied." );
			return;
		}

		selected.X = tile.X;
		selected.Z = tile.Z;
		hoveredTileKey = "";
		RenderTacticalOverlays();
		RenderUnits();
		SetStatus( $"Moved {selected.Id} to ({tile.X}, {tile.Z})." );
	}

	private void SelectNextUnit()
	{
		if ( data.Units.Count == 0 )
			return;

		var index = data.Units.FindIndex( unit => unit.Id == selectedUnitId );
		var next = data.Units[(index + 1 + data.Units.Count) % data.Units.Count];
		selectedUnitId = next.Id;
		hoveredTileKey = "";
		RenderTacticalOverlays();
		RenderUnits();
		SetStatus( $"Selected {next.Id}. Hover a blue tile for path preview, then left-click to move." );
	}

	private void ResetUnits()
	{
		foreach ( var unit in data.Units )
		{
			if ( startingUnitPositions.TryGetValue( unit.Id, out var start ) )
			{
				unit.X = start.X;
				unit.Z = start.Z;
			}
		}

		selectedUnitId = data.Tactical?.SelectedUnit ?? data.Units.FirstOrDefault()?.Id ?? "";
		hoveredTileKey = data.Tactical?.InitialPath.LastOrDefault() is { } destination
			? TileKey( destination.X, destination.Z )
			: "";
		RenderTacticalOverlays();
		RenderUnits();
		SetStatus( "Reset units to the authored spike setup." );
	}

	private SpikeTile? TileUnderMouse()
	{
		if ( Scene.Camera is null )
			return null;

		var ray = Scene.Camera.ScreenPixelToRay( Mouse.Position );
		var boardPlane = new Plane( Vector3.Up, 0 );
		if ( !boardPlane.TryTrace( ray, out var hit, true, 10000 ) )
			return null;

		var x = (int)MathF.Floor( hit.x / TileSize + data.Size.Width * 0.5f );
		var z = (int)MathF.Floor( hit.y / TileSize + data.Size.Depth * 0.5f );
		if ( x < 0 || z < 0 || x >= data.Size.Width || z >= data.Size.Depth )
			return null;

		return new SpikeTile( x, z );
	}

	private Dictionary<string, int> ComputeMoveRange( int startX, int startZ, int movePoints )
	{
		var range = new Dictionary<string, int>();
		var queue = new Queue<SpikeTile>();
		var startKey = TileKey( startX, startZ );
		range[startKey] = 0;
		queue.Enqueue( new SpikeTile( startX, startZ ) );

		while ( queue.Count > 0 )
		{
			var tile = queue.Dequeue();
			var distance = range[TileKey( tile.X, tile.Z )];
			if ( distance >= movePoints )
				continue;

			foreach ( var next in Neighbors( tile.X, tile.Z ) )
			{
				var key = TileKey( next.X, next.Z );
				if ( range.ContainsKey( key ) || !CanEnterTile( next.X, next.Z, selectedUnitId ) )
					continue;

				range[key] = distance + 1;
				queue.Enqueue( next );
			}
		}

		return range;
	}

	private List<SpikePoint> FindPath( int startX, int startZ, int targetX, int targetZ )
	{
		var targetKey = TileKey( targetX, targetZ );
		if ( !currentMoveRange.ContainsKey( targetKey ) )
			return new List<SpikePoint>();

		var cameFrom = new Dictionary<string, string>();
		var visited = new HashSet<string>();
		var queue = new Queue<SpikeTile>();
		var startKey = TileKey( startX, startZ );
		visited.Add( startKey );
		queue.Enqueue( new SpikeTile( startX, startZ ) );

		while ( queue.Count > 0 )
		{
			var tile = queue.Dequeue();
			var key = TileKey( tile.X, tile.Z );
			if ( key == targetKey )
				break;

			foreach ( var next in Neighbors( tile.X, tile.Z ) )
			{
				var nextKey = TileKey( next.X, next.Z );
				if ( visited.Contains( nextKey ) || !currentMoveRange.ContainsKey( nextKey ) )
					continue;

				visited.Add( nextKey );
				cameFrom[nextKey] = key;
				queue.Enqueue( next );
			}
		}

		if ( targetKey != startKey && !cameFrom.ContainsKey( targetKey ) )
			return new List<SpikePoint>();

		var path = new List<SpikePoint>();
		var cursor = targetKey;
		path.Add( TileFromKey( cursor ).ToPoint() );
		while ( cursor != startKey )
		{
			cursor = cameFrom[cursor];
			path.Add( TileFromKey( cursor ).ToPoint() );
		}

		path.Reverse();
		return path;
	}

	private IEnumerable<SpikeTile> Neighbors( int x, int z )
	{
		yield return new SpikeTile( x + 1, z );
		yield return new SpikeTile( x - 1, z );
		yield return new SpikeTile( x, z + 1 );
		yield return new SpikeTile( x, z - 1 );
	}

	private bool CanEnterTile( int x, int z, string movingUnitId )
	{
		var key = TileKey( x, z );
		if ( !floorTiles.Contains( key ) || blockedTiles.Contains( key ) )
			return false;

		return !IsOccupiedByOtherUnit( x, z, movingUnitId );
	}

	private bool IsOccupiedByOtherUnit( int x, int z, string movingUnitId )
	{
		return data.Units.Any( unit => unit.Id != movingUnitId && unit.X == x && unit.Z == z );
	}

	private SpikeUnit SelectedUnit()
	{
		return data.Units.FirstOrDefault( unit => unit.Id == selectedUnitId );
	}

	private void ClearObjects( List<GameObject> objects )
	{
		foreach ( var obj in objects.ToArray() )
		{
			if ( obj.IsValid() )
				obj.Destroy();
		}

		objects.Clear();
	}

	private void SetStatus( string message )
	{
		statusLine = message;
		Log.Info( $"CS2 Tactics S&box Spike: {message}" );
	}

	private static void EachRect( SpikeRect rect, Action<int, int> visit )
	{
		for ( var x = rect.X; x < rect.X + Math.Max( rect.W, 1 ); x++ )
		{
			for ( var z = rect.Z; z < rect.Z + Math.Max( rect.D, 1 ); z++ )
				visit( x, z );
		}
	}

	private static string TileKey( int x, int z )
	{
		return $"{x},{z}";
	}

	private static SpikeTile TileFromKey( string key )
	{
		var parts = key.Split( ',' );
		return new SpikeTile( int.Parse( parts[0] ), int.Parse( parts[1] ) );
	}

	private GameObject AddTileRect( string name, int x, int z, int w, int d, float height, Color color, float zOffset, List<GameObject> owner = null )
	{
		var center = TileRectCenter( x, z, w, d, zOffset );
		var size = new Vector3( MathF.Max( w, 1 ) * TileSize - 2, MathF.Max( d, 1 ) * TileSize - 2, height );
		return AddBox( name, center, size, color, owner );
	}

	private GameObject AddBox( string name, Vector3 position, Vector3 size, Color color, List<GameObject> owner = null )
	{
		var go = new GameObject( GameObject, true, name );
		go.WorldPosition = position;
		go.WorldScale = new Vector3( size.x / 50.0f, size.y / 50.0f, size.z / 50.0f );

		var renderer = go.Components.Create<ModelRenderer>();
		renderer.Model = BoxModel;
		renderer.MaterialOverride = DefaultMaterial;
		renderer.Tint = color;

		(owner ?? generatedObjects).Add( go );
		return go;
	}

	private Vector3 TileCenter( int x, int z, float height )
	{
		return TileRectCenter( x, z, 1, 1, height );
	}

	private Vector3 TileRectCenter( int x, int z, int w, int d, float height )
	{
		var worldX = (x + w * 0.5f - data.Size.Width * 0.5f) * TileSize;
		var worldY = (z + d * 0.5f - data.Size.Depth * 0.5f) * TileSize;
		return new Vector3( worldX, worldY, height );
	}

	private Vector3 BoardCenter()
	{
		return new Vector3( 0, 0, 0 );
	}

	private static Color SurfaceColor( string surface )
	{
		return surface switch
		{
			"spawn_t" => new Color( 0.78f, 0.66f, 0.57f ),
			"spawn_ct" => new Color( 0.58f, 0.68f, 0.78f ),
			"site_b" => new Color( 0.76f, 0.70f, 0.55f ),
			_ => new Color( 0.70f, 0.69f, 0.64f )
		};
	}

	private static Color PropColor( string type )
	{
		return type switch
		{
			"barrel" => new Color( 0.46f, 0.34f, 0.22f ),
			"sandbag" => new Color( 0.58f, 0.50f, 0.38f ),
			"fountain" => new Color( 0.62f, 0.68f, 0.72f ),
			"coffin" => new Color( 0.38f, 0.34f, 0.30f ),
			"orange" => new Color( 0.86f, 0.42f, 0.08f ),
			"b_marker" => new Color( 0.95f, 0.72f, 0.08f ),
			_ => new Color( 0.50f, 0.43f, 0.34f )
		};
	}
}

public sealed class SpikeMapData
{
	[JsonPropertyName( "name" )] public string Name { get; set; } = "";
	[JsonPropertyName( "size" )] public SpikeSize Size { get; set; } = new();
	[JsonPropertyName( "floors" )] public List<SpikeRect> Floors { get; set; } = new();
	[JsonPropertyName( "walls" )] public List<SpikeRect> Walls { get; set; } = new();
	[JsonPropertyName( "props" )] public List<SpikeRect> Props { get; set; } = new();
	[JsonPropertyName( "units" )] public List<SpikeUnit> Units { get; set; } = new();
	[JsonPropertyName( "tactical" )] public SpikeTactical Tactical { get; set; } = new();
}

public sealed class SpikeSize
{
	[JsonPropertyName( "width" )] public int Width { get; set; }
	[JsonPropertyName( "depth" )] public int Depth { get; set; }
}

public sealed class SpikeRect
{
	[JsonPropertyName( "id" )] public string Id { get; set; } = "";
	[JsonPropertyName( "surface" )] public string Surface { get; set; } = "";
	[JsonPropertyName( "type" )] public string Type { get; set; } = "";
	[JsonPropertyName( "x" )] public int X { get; set; }
	[JsonPropertyName( "z" )] public int Z { get; set; }
	[JsonPropertyName( "w" )] public int W { get; set; }
	[JsonPropertyName( "d" )] public int D { get; set; }
	[JsonPropertyName( "h" )] public int H { get; set; }
}

public sealed class SpikeUnit
{
	[JsonPropertyName( "id" )] public string Id { get; set; } = "";
	[JsonPropertyName( "team" )] public string Team { get; set; } = "";
	[JsonPropertyName( "role" )] public string Role { get; set; } = "";
	[JsonPropertyName( "x" )] public int X { get; set; }
	[JsonPropertyName( "z" )] public int Z { get; set; }
	[JsonPropertyName( "facing" )] public SpikePoint Facing { get; set; } = new();
}

public sealed class SpikeTactical
{
	[JsonPropertyName( "selectedUnit" )] public string SelectedUnit { get; set; } = "";
	[JsonPropertyName( "movePoints" )] public int MovePoints { get; set; }
	[JsonPropertyName( "initialPath" )] public List<SpikePoint> InitialPath { get; set; } = new();
	[JsonPropertyName( "dangerCone" )] public List<SpikePoint> DangerCone { get; set; } = new();
}

public sealed class SpikePoint
{
	[JsonPropertyName( "x" )] public int X { get; set; }
	[JsonPropertyName( "z" )] public int Z { get; set; }
}

public readonly record struct SpikeTile( int X, int Z )
{
	public SpikePoint ToPoint()
	{
		return new SpikePoint { X = X, Z = Z };
	}
}
