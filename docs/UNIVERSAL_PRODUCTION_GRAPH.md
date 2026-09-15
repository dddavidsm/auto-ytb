# Universal Production Graph

The graph is a typed, inspectable sequence of optional nodes:

`Research → Concept → Story → Script → Voice → Character/World → AssetSearch → Image/Video/Performance → Timeline → Captions/Music/SFX → QC → Repair → Packaging → Publishing → Analytics`.

Formats activate nodes rather than creating separate pipelines. A sourced documentary can skip character generation; a recurring series can activate character, world and performance nodes; a manual script can skip ideation.

Every production persists its brief, active formats, node state, artifacts, costs and QC decisions. Local repairs use `EditPatch` objects with timestamps, affected nodes, estimated cost and localized QC requirements.
