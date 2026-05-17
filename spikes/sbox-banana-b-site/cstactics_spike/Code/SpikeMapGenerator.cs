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
	private string selectedUnitId;
	private bool built;

	protected override void OnStart()
	{
		Build();
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
	}

	private void Build()
	{
		if ( built )
			return;

		data = LoadData();
		selectedUnitId = data.Tactical?.SelectedUnit ?? data.Units.FirstOrDefault()?.Id ?? "";

		CreateBoardBase();
		CreateFloors();
		CreateTacticalOverlays();
		CreateWalls();
		CreateProps();
		CreateUnits();
		CreateLegend();

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

	private void CreateTacticalOverlays()
	{
		if ( data.Tactical is null )
			return;

		foreach ( var danger in data.Tactical.DangerCone )
			AddTileRect( $"danger {danger.X},{danger.Z}", danger.X, danger.Z, 1, 1, 3, new Color( 0.8f, 0.08f, 0.06f ), 7 );

		for ( var i = 0; i < data.Tactical.InitialPath.Count; i++ )
		{
			var point = data.Tactical.InitialPath[i];
			AddTileRect( $"path {i:00}", point.X, point.Z, 1, 1, 4, new Color( 0.08f, 0.42f, 0.9f ), 11 );
		}
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

	private void CreateUnits()
	{
		foreach ( var unit in data.Units )
		{
			var baseColor = unit.Team.Equals( "CT", StringComparison.OrdinalIgnoreCase )
				? new Color( 0.05f, 0.25f, 0.95f )
				: new Color( 0.95f, 0.06f, 0.035f );

			var isSelected = unit.Id == selectedUnitId;
			var pos = TileCenter( unit.X, unit.Z, 42 );
			var marker = AddBox( $"unit {unit.Id} {unit.Role}", pos, new Vector3( 30, 30, isSelected ? 78 : 62 ), baseColor );
			unitObjects[unit.Id] = marker;

			AddBox(
				$"unit cap {unit.Id}",
				pos + Vector3.Up * (isSelected ? 46 : 36),
				new Vector3( isSelected ? 46 : 34, isSelected ? 46 : 34, 8 ),
				isSelected ? new Color( 1.0f, 0.92f, 0.15f ) : Color.White
			);

			var facing = new Vector3( unit.Facing.X, unit.Facing.Z, 0 );
			if ( facing.LengthSquared > 0 )
			{
				facing = facing.Normal;
				AddBox( $"facing {unit.Id}", pos + facing * 26 + Vector3.Up * 10, new Vector3( 34, 8, 8 ), Color.White );
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

	private GameObject AddTileRect( string name, int x, int z, int w, int d, float height, Color color, float zOffset )
	{
		var center = TileRectCenter( x, z, w, d, zOffset );
		var size = new Vector3( MathF.Max( w, 1 ) * TileSize - 2, MathF.Max( d, 1 ) * TileSize - 2, height );
		return AddBox( name, center, size, color );
	}

	private GameObject AddBox( string name, Vector3 position, Vector3 size, Color color )
	{
		var go = new GameObject( GameObject, true, name );
		go.WorldPosition = position;
		go.WorldScale = new Vector3( size.x / 50.0f, size.y / 50.0f, size.z / 50.0f );

		var renderer = go.Components.Create<ModelRenderer>();
		renderer.Model = BoxModel;
		renderer.MaterialOverride = DefaultMaterial;
		renderer.Tint = color;

		generatedObjects.Add( go );
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
