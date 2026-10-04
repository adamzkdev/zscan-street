# STREET.ZSCAN.CASH --- Unity 6 Implementation Specs

## Mission

Build `street.zscan.cash` as a **real-time, interactive isometric
visualization of the Zcash blockchain**.

Core concept:

> **The Zcash blockchain becomes a living isometric city.**

This is not another explorer, analytics dashboard, generic NFT gallery,
metaverse, or fantasy RPG. The existing ZScan API is the source of
truth; real Zcash activity drives the world.

------------------------------------------------------------------------

## 1. Technology

Use:

-   **Unity 6.6+**
-   C#
-   WebGPU preferred
-   WebGL2 fallback
-   Desktop first
-   Mobile-compatible architecture
-   Unity CLI/batch builds

The application is deployed to:

`https://street.zscan.cash`

The development workflow should support an AI coding agent such as Opus:

``` text
Opus
  ↓
edit C# / Unity assets
  ↓
Unity CLI build
  ↓
tests / inspect output
  ↓
fix
  ↓
build again
```

Create deterministic build scripts and do not depend on manual
Editor-only steps.

Conceptual build command:

``` bash
unity -batchmode   -projectPath ./street-zscan   -buildTarget WebGL   -executeMethod Build.BuildWeb   -quit
```

Adapt the command to the installed Unity version/environment.

------------------------------------------------------------------------

## 2. Repository structure

``` text
street-zscan/
├── Assets/
│   ├── Art/
│   │   ├── City/
│   │   ├── Characters/
│   │   ├── Vehicles/
│   │   ├── Props/
│   │   └── UI/
│   ├── Materials/
│   ├── Prefabs/
│   ├── Scenes/
│   ├── ScriptableObjects/
│   └── Textures/
├── Packages/
├── ProjectSettings/
├── Scripts/
│   ├── ZScan/
│   ├── World/
│   ├── Characters/
│   ├── Transactions/
│   ├── Blocks/
│   ├── Camera/
│   ├── UI/
│   ├── Animation/
│   └── Performance/
├── Editor/
├── Tests/
│   ├── EditMode/
│   └── PlayMode/
├── Build/
├── specs.md
└── README.md
```

Keep blockchain/data logic separate from Unity rendering/gameplay logic.

------------------------------------------------------------------------

# 3. Visual direction

Use the supplied isometric city reference as the primary art-direction
reference.

### Target

-   isometric camera
-   dark background
-   compact city district
-   low-poly / voxel / pixel-art inspired
-   dark concrete streets
-   small buildings
-   rooftops
-   neon signs
-   street lamps
-   sidewalks
-   crosswalks
-   small props
-   subtle cyberpunk atmosphere
-   purple / cyan / orange / green accents
-   warm street lighting
-   subtle shadows/reflections

The world should feel like a believable small district from an isometric
game.

Think:

**classic isometric game + cyberpunk pixel art + living blockchain**

Not:

**AAA Cyberpunk / fantasy RPG / sci-fi metaverse**

Avoid giant towers, fantasy creatures, magical effects, huge holograms,
excessive bloom, photorealistic humans, and overloaded HUDs.

The city itself should be the interface.

------------------------------------------------------------------------

# 4. MOST IMPORTANT: real zkSNARK NFTs

The characters must be the **actual zkSNARK NFTs from ZScan**.

Do NOT create generic replacement characters.

Do NOT redesign the artwork.

Do NOT turn the NFTs into realistic 3D humans.

For each visible character:

1.  Get the real NFT metadata from ZScan.
2.  Get the original NFT image.
3.  Load it as a Unity texture.
4.  Render it as a sprite/billboard in the 3D environment.
5.  Preserve its original pixel-art appearance.
6.  Preserve its colors and traits.
7.  Preserve its actual NFT ID.

Examples:

`zkSNARK #1` `zkSNARK #2` `zkSNARK #2967` `zkSNARK #4051`
`zkSNARK #5430` `zkSNARK #5791` `zkSNARK #7081`

The environment is 3D/isometric.

The zkSNARKs remain recognizable 2D pixel-art characters living inside
that world.

This contrast is intentional.

------------------------------------------------------------------------

# 5. Character system

Conceptual model:

``` csharp
public class ZkSnarkCharacter
{
    public int Id;
    public string ImageUrl;
    public Trait[] Traits;
    public Vector3 Position;
    public CharacterState State;
}
```

States:

``` text
Idle
Walking
Waiting
Boarding
Riding
Exiting
```

Use:

-   pixel-perfect textures
-   sprite/billboard rendering
-   appropriate texture filtering
-   texture atlases where useful
-   simple walking/idle animation
-   subtle movement

Do not smooth, distort, or redesign the original NFT artwork.

------------------------------------------------------------------------

# 6. Core metaphor

## zkSNARKs = inhabitants

The zkSNARKs physically live in the city.

They:

-   walk
-   stop
-   cross streets
-   wait
-   gather near stations
-   carry transactions
-   board block vehicles
-   leave

## Transactions = cargo

A zkSNARK can carry transaction cargo in a backpack.

Conceptually:

``` text
zkSNARK
  🎒
  ├── TX A
  ├── TX B
  └── TX C
```

Do not permanently display text above every character.

Use subtle visual cues such as a backpack, glow, packet icons, or a
small count.

Detailed information appears only when selected.

------------------------------------------------------------------------

# 7. Blocks = public transport

This is the central metaphor.

A Zcash block is represented by a reusable bus/tram.

Example:

`BLOCK 3,428,152`

A block vehicle arrives at a station.

zkSNARK characters approach.

Transactions are loaded.

Characters board.

The bus departs.

The block becomes part of the chain.

Then the next block arrives.

This must be driven by real blockchain data, not random simulation.

------------------------------------------------------------------------

# 8. Block lifecycle

When ZScan reports a new block:

### 1. Incoming

The block bus enters the city.

### 2. Arrival

It reaches the station.

### 3. Boarding

Characters carrying transactions walk toward it.

### 4. Loading

Transaction cargo moves into the bus.

### 5. Doors close

Short pause.

### 6. Departure

The bus leaves.

### 7. Confirmation

Use a subtle confirmation animation.

The user should understand that a new block happened without needing a
dashboard.

------------------------------------------------------------------------

# 9. Transaction journey

A transaction should have a physical journey:

``` text
zkSNARK
   ↓
transaction
   ↓
street
   ↓
block bus
   ↓
block
   ↓
confirmed
```

When a transaction is selected:

-   highlight it
-   subtly dim unrelated activity
-   activate follow camera
-   follow the transaction through the scene

This should be one of Street's signature interactions.

------------------------------------------------------------------------

# 10. Mempool

The mempool is the waiting/loading area.

Pending transactions wait near a station.

Concept:

``` text
MEMPOOL
   ↓
waiting
   ↓
new block
   ↓
transaction boards
   ↓
departure
```

When a transaction becomes included in a block, the visual state changes
according to the real ZScan data.

Never fabricate blockchain activity.

------------------------------------------------------------------------

# 11. City districts

The initial city can contain visually distinct areas.

### Shielded District

Shielded activity.

### Orchard

Orchard-related activity.

Visual language:

-   green
-   vegetation
-   softer lighting

### Ironwood

New shielded infrastructure.

Visual language:

-   purple
-   darker architecture
-   industrial feel

### Transparent District

Transparent activity.

Visual language:

-   brighter
-   more open streets

### Mempool

Pending activity.

Visual language:

-   industrial
-   loading docks
-   waiting areas

Do not rely on giant labels. Let the environment communicate the
difference.

------------------------------------------------------------------------

# 12. NU6.3 / NU7

The architecture must allow the city to evolve with Zcash upgrades.

Create a concept such as:

``` csharp
NetworkVersion
```

which can influence:

-   districts
-   visual themes
-   shielded pool representation
-   transaction visualization
-   signage
-   vehicles
-   environment
-   special events

The goal is for:

`NU6.3 → NU7`

to become a visible evolution of the city.

Do not hardcode the entire world around one protocol version.

------------------------------------------------------------------------

# 13. ZScan API

**ZScan API is the source of truth.**

Before implementing the data layer:

1.  Inspect the existing ZScan repository.
2.  Inspect the current API.
3.  Identify actual endpoints.
4.  Identify actual response schemas.
5.  Identify NFT metadata/image endpoints.
6.  Reuse existing types wherever possible.

Potential data requirements:

-   latest block
-   block details
-   block transactions
-   transaction details
-   mempool
-   addresses
-   shielded pools
-   Orchard
-   Ironwood
-   zkSNARK metadata
-   zkSNARK images
-   zkSNARK traits

Do not invent endpoints when equivalent ZScan endpoints already exist.

------------------------------------------------------------------------

# 14. ZScan client

Create a dedicated C# data layer.

Conceptual interface:

``` csharp
ZScanClient
    GetLatestBlock()
    GetBlock(height)
    GetBlockTransactions(height)
    GetTransaction(txid)
    GetMempool()
    GetZkSnark(id)
    GetZkSnarks()
    SubscribeToEvents()
```

Adapt to the actual ZScan API.

Do not hardcode blockchain values into Unity scenes.

------------------------------------------------------------------------

# 15. World state

Create a central state independent from rendering:

``` csharp
public class WorldState
{
    public Block CurrentBlock;
    public Block PreviousBlock;

    public List<Transaction> Transactions;
    public List<Transaction> MempoolTransactions;

    public List<ZkSnarkCharacter> ZkSnarks;
    public List<BlockVehicle> Vehicles;
}
```

Architecture:

``` text
ZScan API
    ↓
ZScanClient
    ↓
WorldState
    ↓
World Events
    ↓
Unity Systems
```

Rendering code must not directly own API polling.

------------------------------------------------------------------------

# 16. Event architecture

Create domain events such as:

``` text
NewBlockEvent
TransactionAddedEvent
TransactionConfirmedEvent
MempoolTransactionEvent
ZkSnarkLoadedEvent
NetworkUpgradeEvent
```

Example:

``` text
ZScan
 ↓
NewBlockEvent
 ↓
BlockManager
 ↓
Bus arrives
 ↓
TransactionManager
 ↓
Characters board
 ↓
AnimationController
```

Keep data, state, and presentation modular.

------------------------------------------------------------------------

# 17. Unity architecture

Recommended systems:

``` text
StreetApp
│
├── WorldManager
│
├── ZScan
│   ├── ZScanClient
│   ├── WorldState
│   └── EventBus
│
├── City
│   ├── CityManager
│   ├── Buildings
│   ├── Streets
│   ├── Props
│   └── Lighting
│
├── Characters
│   ├── ZkSnarkManager
│   ├── SpriteRenderer
│   └── CharacterAnimator
│
├── Blocks
│   ├── BlockManager
│   ├── BlockBus
│   └── BoardingController
│
├── Transactions
│   ├── TransactionManager
│   └── TransactionAnimator
│
├── Camera
│   ├── CameraManager
│   ├── FollowController
│   └── IsometricController
│
├── Interaction
│   ├── RaycastManager
│   └── SelectionManager
│
└── UI
    └── DetailPanel
```

------------------------------------------------------------------------

# 18. Isometric camera

Default camera:

-   orthographic
-   isometric
-   smooth
-   zoomable
-   pannable
-   orbitable where appropriate

Modes:

### LIVE

Default world view.

### FREE CAMERA

User controls the camera.

### FOLLOW ZKSNARK

Follow selected character.

### FOLLOW TRANSACTION

Follow selected transaction.

### FOLLOW BLOCK

Follow block bus.

### OVERVIEW

Full city view.

Use cinematic camera transitions rather than abrupt teleports.

------------------------------------------------------------------------

# 19. Interaction

Use Unity raycasting.

Character click:

``` text
Raycast
 ↓
NFT ID
 ↓
WorldState/cache
 ↓
Detail Panel
```

Selected character gets a subtle outline/glow.

Transaction click:

``` text
Raycast
 ↓
TXID
 ↓
transaction state
 ↓
Follow Transaction
```

Do not modify the NFT artwork.

------------------------------------------------------------------------

# 20. Character detail panel

Keep it minimal:

``` text
zkSNARK #2967

[REAL NFT IMAGE]

Lineage     Alien
Rarity      Legendary
Block       XXXXXXX

Carrying    3 transactions
Value       XX ZEC

TRANSACTIONS

#a82f...
4.2 ZEC
Shielded
Orchard

#91bd...
0.72 ZEC
Shielded
Ironwood

#f31a...
1.0 ZEC
Transparent
```

The panel is secondary.

The 3D world remains the main interface.

------------------------------------------------------------------------

# 21. No UI clutter

Do NOT permanently place floating bubbles over characters.

Avoid:

-   transaction counts above everyone
-   balances above everyone
-   permanent labels
-   speech bubbles
-   large cards
-   giant analytics

Only show detailed information after selection or during important
blockchain events.

------------------------------------------------------------------------

# 22. Block bus

Build one excellent reusable bus prefab.

It should have:

-   Zcash logo
-   dynamic block number
-   doors
-   windows
-   headlights
-   subtle emissive lighting
-   believable isometric proportions

Example:

``` text
┌────────────────────────────┐
│       BLOCK 3428152        │
│            Z               │
└────────────────────────────┘
```

The same prefab represents every block.

------------------------------------------------------------------------

# 23. Transaction visual language

Keep it restrained.

### Shielded

Subtle green/purple.

### Transparent

Orange/white.

### Orchard

Green.

### Ironwood

Purple.

Do not use giant particle explosions.

The goal is clarity, not spectacle.

------------------------------------------------------------------------

# 24. Lighting

Lighting is a major quality component.

Use:

-   soft night ambience
-   warm street lamps
-   cool ambient fill
-   subtle emissive signs
-   soft shadows
-   restrained bloom
-   subtle wet-street reflections where practical

Avoid over-saturated neon and excessive bloom.

The supplied city reference should remain readable and atmospheric.

------------------------------------------------------------------------

# 25. Animation

Characters:

-   idle
-   walking
-   turning
-   waiting
-   boarding
-   riding
-   exiting

Bus:

-   arrival
-   braking
-   doors opening
-   boarding
-   doors closing
-   departure

Transactions:

-   pickup
-   movement
-   loading
-   confirmation

Keep animation stylized and readable.

------------------------------------------------------------------------

# 26. Performance

Potentially thousands of zkSNARKs exist.

Do NOT create 10,000 expensive unique GameObjects.

Use:

-   sprite atlases
-   texture caching
-   object pooling
-   GPU-friendly batching
-   LOD
-   frustum culling
-   lazy loading
-   asynchronous asset loading

MVP should display around 10--30 visible zkSNARKs.

Scale later.

Far-away characters can use cheaper representations.

Selected/nearby characters can use full-resolution artwork.

------------------------------------------------------------------------

# 27. Browser performance

Because this is a web experience:

-   optimize initial load
-   compress textures
-   lazy-load NFT assets
-   cache downloaded assets
-   minimize scene size
-   use asynchronous API calls
-   avoid loading all 10,000 NFT images at startup
-   keep memory use under control

Only load assets required by the current world state.

------------------------------------------------------------------------

# 28. WebGPU / WebGL2

Target:

``` text
WebGPU
  ↓
preferred
```

Fallback:

``` text
WebGL2
```

Core application logic must not depend exclusively on WebGPU-specific
features.

The experience should degrade gracefully.

------------------------------------------------------------------------

# 29. Build pipeline

Create deterministic Editor build scripts.

Conceptual:

``` csharp
public static class Build
{
    public static void BuildWeb()
    {
        // deterministic production Web build
    }
}
```

Support at least:

``` text
development build
production build
```

CLI should be the preferred reproducible build path.

------------------------------------------------------------------------

# 30. Testing

EditMode tests:

-   API parsing
-   block parsing
-   transaction parsing
-   NFT metadata parsing
-   WorldState updates
-   event generation

PlayMode tests:

-   character spawning
-   character selection
-   bus arrival
-   boarding
-   transaction loading
-   follow camera
-   new block animation

The data layer must be testable without rendering.

------------------------------------------------------------------------

# 31. MVP

Build **one excellent city block**, not the entire world.

Required:

1.  Unity isometric environment
2.  10--30 real zkSNARK NFT sprites
3.  Real latest Zcash block
4.  Real transactions
5.  One reusable block bus
6.  Characters walking
7.  Characters carrying transactions
8.  Characters boarding the bus
9.  New block animation
10. Click zkSNARK
11. Click transaction
12. Follow character
13. Follow transaction
14. Live ZScan API connection

Nothing else is required for milestone one.

------------------------------------------------------------------------

# 32. Development phases

## Phase 1 --- World

No API.

Build:

-   isometric camera
-   streets
-   buildings
-   props
-   lighting
-   sidewalks
-   bus stop
-   block bus
-   placeholder sprites

The scene must already look good.

## Phase 2 --- Real zkSNARKs

Connect ZScan NFT metadata and images.

Spawn real characters.

Test several actual IDs.

## Phase 3 --- Real block

Connect latest block and show its number on the bus.

## Phase 4 --- Transactions

Load real transactions and attach cargo to characters.

## Phase 5 --- Full event loop

Implement:

``` text
new block
 ↓
bus arrival
 ↓
characters approach
 ↓
boarding
 ↓
transaction loading
 ↓
doors close
 ↓
departure
 ↓
confirmation
```

## Phase 6 --- Interaction

Implement:

-   raycasting
-   zkSNARK selection
-   transaction selection
-   detail panel
-   follow camera
-   transaction tracking
-   block tracking

## Phase 7 --- Mempool

Add pending transaction area and mempool → block transition.

## Phase 8 --- Live network

Add WebSocket/SSE if supported; otherwise polling.

## Phase 9 --- Visual polish

Only after the vertical slice works:

-   lighting
-   shadows
-   animation quality
-   particles
-   reflections
-   post-processing
-   sound
-   performance

## Phase 10 --- Scale

Expand:

-   streets
-   districts
-   zkSNARK population
-   visualizations
-   NU7 evolution
-   additional blockchain events

------------------------------------------------------------------------

# 33. Vertical slice acceptance test

Before expanding the project, this exact loop must work:

``` text
REAL ZSCAN API
      ↓
REAL zkSNARK #XXXX
      ↓
UNITY ISOMETRIC CITY
      ↓
CHARACTER SPAWNS
      ↓
CHARACTER WALKS
      ↓
CHARACTER CARRIES REAL TX
      ↓
BLOCK BUS ARRIVES
      ↓
CHARACTER BOARDS
      ↓
TX LOADS
      ↓
BUS DEPARTS
      ↓
NEW BLOCK STATE
```

If this loop feels beautiful and understandable, the core product works.

------------------------------------------------------------------------

# 34. Golden rule

Whenever there is a choice between:

> "make it technically impressive"

and:

> "make the blockchain immediately understandable"

choose the second.

Someone who knows nothing about Zcash should open Street and immediately
understand:

> "Those are the zkSNARKs."
>
> "They're moving through the city."
>
> "They're carrying transactions."
>
> "That bus is a block."
>
> "They're getting on it."
>
> "That's the blockchain moving."

That is the product.

------------------------------------------------------------------------

# 35. Product positioning

The ZScan products should remain distinct:

``` text
zscan.cash
    ↓
Explorer

stats.zscan.cash
    ↓
Analytics

street.zscan.cash
    ↓
Living blockchain visualization
```

Street should not duplicate explorer or analytics functionality.

Its job is to make the network **visual, intuitive, memorable, and fun
to watch**.

------------------------------------------------------------------------

# 36. Final visual target

The final experience should feel like:

> **TXStreet × isometric pixel-art city × real Zcash data × the actual
> zkSNARK NFT collection**

with its own identity.

Keep the environment:

-   isometric
-   restrained
-   dark
-   detailed
-   atmospheric
-   pixel/voxel inspired
-   believable
-   small-scale
-   game-like
-   polished

Keep actual zkSNARK artwork recognizable and untouched.

No unnecessary HUD.

No permanent floating bubbles.

No fantasy creatures.

No giant holographic interfaces.

No fake blockchain activity.

No generic replacement characters.

**The city itself is the interface.**

------------------------------------------------------------------------

# 37. Engineering principles

Before writing substantial code:

1.  Inspect the existing ZScan repository.
2.  Inspect the existing API.
3.  Identify exact endpoints and response schemas.
4.  Identify how zkSNARK metadata is served.
5.  Identify how NFT images are served.
6.  Reuse existing ZScan types where possible.
7.  Do not duplicate indexing logic.
8.  Keep Street as a visualization client of ZScan.
9.  Build the smallest end-to-end vertical slice first.
10. Do not expand the world before the core interaction feels excellent.

The target is not "a lot of features."

The target is:

> **A small world that makes real Zcash activity feel alive.**
