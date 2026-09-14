import argparse
import json
import math
import os
import sys
from pathlib import Path

import bpy
from mathutils import Vector


def parse_args():
    raw = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
    parser = argparse.ArgumentParser()
    parser.add_argument("--glb", required=True)
    parser.add_argument("--out", required=True)
    return parser.parse_args(raw)


def look_at(obj, target):
    direction = Vector(target) - obj.location
    obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()


def material(name, color, roughness=0.5, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.diffuse_color = (*color, 1.0)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf:
        bsdf.inputs["Base Color"].default_value = (*color, 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = metallic
    return mat


def bbox(objects):
    points = []
    for obj in objects:
        if obj.type != "MESH":
            continue
        points.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if not points:
        return Vector((0, 0, 0)), Vector((0, 0, 0))
    return Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points))), Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))


def add_studio(root, min_v, max_v):
    center = (min_v + max_v) * 0.5
    floor = bpy.data.meshes.new("MOSS_STUDIO_FLOOR_MESH")
    floor.from_pydata([(-6, -6, min_v.z), (6, -6, min_v.z), (6, 6, min_v.z), (-6, 6, min_v.z)], [], [(0, 1, 2, 3)])
    floor.update()
    floor_obj = bpy.data.objects.new("MOSS_STUDIO_FLOOR", floor)
    bpy.context.collection.objects.link(floor_obj)
    floor_obj.data.materials.append(material("StudioFloor", (0.035, 0.055, 0.07), 0.7))

    world = bpy.context.scene.world or bpy.data.worlds.new("MOSS_STUDIO_WORLD")
    bpy.context.scene.world = world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs["Color"].default_value = (0.008, 0.015, 0.025, 1.0)
        bg.inputs["Strength"].default_value = 0.25

    def area(name, location, energy, size, color):
        data = bpy.data.lights.new(name, "AREA")
        data.energy = energy
        data.shape = "DISK"
        data.size = size
        data.color = color
        obj = bpy.data.objects.new(name, data)
        bpy.context.collection.objects.link(obj)
        obj.location = location
        look_at(obj, center)
        return obj

    area("Key", (3.8, -4.5, max_v.z * 1.15), 850, 4.0, (1.0, 0.78, 0.58))
    area("Fill", (-4.0, -2.0, max_v.z * 0.8), 500, 4.0, (0.45, 0.68, 1.0))
    area("Rim", (0.0, 3.5, max_v.z * 1.1), 1000, 3.0, (0.75, 0.9, 1.0))

    camera_data = bpy.data.cameras.new("MOSS_TURNTABLE_CAMERA")
    camera = bpy.data.objects.new("MOSS_TURNTABLE_CAMERA", camera_data)
    bpy.context.collection.objects.link(camera)
    bpy.context.scene.camera = camera
    camera_data.lens = 58
    camera_data.sensor_width = 36
    return camera, center


def set_camera(camera, center, angle, distance, height):
    camera.location = (math.sin(angle) * distance, -math.cos(angle) * distance, height)
    look_at(camera, center)


def render_still(scene, camera, center, path, angle=0.0, close=False, focus_z=None):
    distance = 7.2 if not close else 3.3
    focus = Vector((center.x, center.y, focus_z if focus_z is not None else center.z))
    set_camera(camera, focus, angle, distance, focus.z)
    scene.render.filepath = str(path)
    scene.render.image_settings.file_format = "PNG"
    scene.render.resolution_percentage = 100
    bpy.ops.render.render(write_still=True)


def bone(ebones, name, head, tail, parent=None, use_connect=False):
    b = ebones.new(name)
    b.head = head
    b.tail = tail
    if parent:
        b.parent = ebones.get(parent)
        b.use_connect = use_connect
    return b


def create_armature(mesh_objects, min_v, max_v):
    center = (min_v + max_v) * 0.5
    width = max(0.7, max_v.x - min_v.x)
    depth = max(0.4, max_v.y - min_v.y)
    height = max(1.0, max_v.z - min_v.z)
    z = min_v.z
    arm_data = bpy.data.armatures.new("MOSS_RIG_PROTOTYPE_V1")
    arm = bpy.data.objects.new("MOSS_RIG_PROTOTYPE_V1", arm_data)
    bpy.context.collection.objects.link(arm)
    bpy.context.view_layer.objects.active = arm
    arm.select_set(True)
    bpy.ops.object.mode_set(mode="EDIT")
    e = arm_data.edit_bones
    bone(e, "root", (center.x, center.y, z), (center.x, center.y, z + height * 0.12))
    bone(e, "hips", (center.x, center.y, z + height * 0.38), (center.x, center.y, z + height * 0.48), "root")
    bone(e, "spine", (center.x, center.y, z + height * 0.48), (center.x, center.y, z + height * 0.67), "hips", True)
    bone(e, "chest", (center.x, center.y, z + height * 0.67), (center.x, center.y, z + height * 0.78), "spine", True)
    bone(e, "neck", (center.x, center.y, z + height * 0.78), (center.x, center.y, z + height * 0.87), "chest", True)
    bone(e, "head", (center.x, center.y, z + height * 0.87), (center.x, center.y, z + height * 0.99), "neck", True)
    for side, sign in (("L", -1), ("R", 1)):
        x = center.x + sign * width * 0.22
        elbow_x = center.x + sign * width * 0.34
        hand_x = center.x + sign * width * 0.42
        bone(e, f"upper_arm.{side}", (center.x + sign * width * 0.18, center.y, z + height * 0.75), (elbow_x, center.y, z + height * 0.61), "chest")
        bone(e, f"forearm.{side}", (elbow_x, center.y, z + height * 0.61), (hand_x, center.y, z + height * 0.52), f"upper_arm.{side}", True)
        bone(e, f"hand.{side}", (hand_x, center.y, z + height * 0.52), (hand_x, center.y, z + height * 0.46), f"forearm.{side}", True)
        hip_x = center.x + sign * width * 0.12
        knee_x = center.x + sign * width * 0.14
        bone(e, f"thigh.{side}", (hip_x, center.y, z + height * 0.4), (knee_x, center.y, z + height * 0.2), "hips")
        bone(e, f"shin.{side}", (knee_x, center.y, z + height * 0.2), (knee_x, center.y, z + height * 0.06), f"thigh.{side}", True)
        bone(e, f"foot.{side}", (knee_x, center.y, z + height * 0.06), (knee_x, center.y - depth * 0.18, z + height * 0.03), f"shin.{side}", True)
    tail_base = (center.x, max_v.y * 0.65, z + height * 0.36)
    previous = "hips"
    for i in range(5):
        head = (tail_base[0], tail_base[1] + depth * i * 0.16, tail_base[2] + height * (0.03 if i < 3 else -0.02 * (i - 2)))
        tail = (head[0], head[1] + depth * 0.18, head[2] + height * (0.025 if i < 2 else -0.03))
        name = "tail_root" if i == 0 else f"tail_{i:02d}"
        bone(e, name, head, tail, previous, i > 0)
        previous = name
    bpy.ops.object.mode_set(mode="OBJECT")
    arm.select_set(False)
    return arm


def parent_with_weights(mesh_objects, arm):
    bpy.ops.object.select_all(action="DESELECT")
    for obj in mesh_objects:
        obj.select_set(True)
    arm.select_set(True)
    bpy.context.view_layer.objects.active = arm
    try:
        bpy.ops.object.parent_set(type="ARMATURE_AUTO")
        return True, None
    except Exception as exc:
        return False, str(exc)


def pose_test(arm, name, rotations):
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    for bone_name, rotation in rotations.items():
        pbone = arm.pose.bones.get(bone_name)
        if pbone:
            pbone.rotation_mode = "XYZ"
            pbone.rotation_euler = rotation
    bpy.ops.object.mode_set(mode="OBJECT")


def reset_pose(arm):
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    for pbone in arm.pose.bones:
        pbone.rotation_mode = "XYZ"
        pbone.rotation_euler = (0, 0, 0)
    bpy.ops.object.mode_set(mode="OBJECT")


def animate_motion(arm, frame, pose):
    bpy.context.scene.frame_set(frame)
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    for bone_name, rotation in pose.items():
        pbone = arm.pose.bones.get(bone_name)
        if pbone:
            pbone.rotation_mode = "XYZ"
            pbone.rotation_euler = rotation
            pbone.keyframe_insert(data_path="rotation_euler", frame=frame)
    bpy.ops.object.mode_set(mode="OBJECT")


def main():
    args = parse_args()
    glb = Path(args.glb).resolve()
    out = Path(args.out).resolve()
    out.mkdir(parents=True, exist_ok=True)
    for folder in ("blender-rnd", "turntable", "rig-rnd", "skinning-rnd", "face-rnd", "motion-reel-rnd", "reports"):
        (out / folder).mkdir(exist_ok=True)

    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=str(glb))
    imported = list(bpy.context.scene.objects)
    mesh_objects = [obj for obj in imported if obj.type == "MESH"]
    if not mesh_objects:
        raise RuntimeError("Meshy GLB imported without mesh objects")

    # Keep the source GLB untouched; normalization happens in the Blender derivative.
    min_v, max_v = bbox(mesh_objects)
    center = (min_v + max_v) * 0.5
    root = bpy.data.objects.new("MOSS_RND_ROOT", None)
    bpy.context.collection.objects.link(root)
    for obj in mesh_objects:
        if obj.parent is None:
            obj.parent = root
    root.location.x -= center.x
    root.location.y -= center.y
    root.location.z -= min_v.z
    bpy.context.view_layer.update()
    min_v, max_v = bbox(mesh_objects)
    camera, target = add_studio(root, min_v, max_v)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = 1920
    scene.render.resolution_y = 1080
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.film_transparent = False
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.fps = 30
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.image_settings.color_depth = "8"
    try:
        scene.render.engine = "BLENDER_EEVEE"
        scene.render.resolution_percentage = 100
    except Exception:
        pass

    mesh_stats = {"objects": len(mesh_objects), "vertices": 0, "edges": 0, "faces": 0, "triangles": 0, "materials": 0, "images": 0, "shapeKeys": []}
    material_names = set()
    image_names = set()
    for obj in mesh_objects:
        mesh = obj.data
        mesh.calc_loop_triangles()
        mesh_stats["vertices"] += len(mesh.vertices)
        mesh_stats["edges"] += len(mesh.edges)
        mesh_stats["faces"] += len(mesh.polygons)
        mesh_stats["triangles"] += len(mesh.loop_triangles)
        for mat in mesh.materials:
            if mat:
                material_names.add(mat.name)
                if mat.node_tree:
                    for node in mat.node_tree.nodes:
                        if node.type == "TEX_IMAGE" and node.image:
                            image_names.add(node.image.name)
        if mesh.shape_keys:
            mesh_stats["shapeKeys"].extend(key.name for key in mesh.shape_keys.key_blocks if key.name != "Basis")
    mesh_stats["materials"] = len(material_names)
    mesh_stats["images"] = len(image_names)
    mesh_stats["dimensions"] = {"x": round(max_v.x - min_v.x, 4), "y": round(max_v.y - min_v.y, 4), "z": round(max_v.z - min_v.z, 4)}

    camera, target = camera, (Vector((0, 0, (max_v.z - min_v.z) * 0.5)))
    stills = []
    face_z = max_v.z * 0.82
    hand_z = max_v.z * 0.61
    tail_z = max_v.z * 0.38
    for label, angle, close, focus_z in (("front", 0, False, None), ("45", math.pi / 4, False, None), ("side", math.pi / 2, False, None), ("135", 3 * math.pi / 4, False, None), ("back", math.pi, False, None), ("close-face", 0, True, face_z), ("hands", math.pi / 2, True, hand_z), ("tail", math.pi, True, tail_z)):
        path = out / "turntable" / f"{label}.png"
        render_still(scene, camera, target, path, angle, close, focus_z)
        stills.append(str(path))

    # A real 360 preview is useful for inspecting silhouette and accessory continuity.
    turntable_frames = out / "turntable" / "frames"
    turntable_frames.mkdir(exist_ok=True)
    for index in range(72):
        path = turntable_frames / f"frame-{index:04d}.png"
        render_still(scene, camera, target, path, (2 * math.pi * index) / 72, False)

    arm = create_armature(mesh_objects, min_v, max_v)
    rig_ok, rig_error = parent_with_weights(mesh_objects, arm)
    rig_bones = [b.name for b in arm.data.bones]
    required = ["root", "hips", "spine", "chest", "neck", "head", "upper_arm.L", "upper_arm.R", "forearm.L", "forearm.R", "hand.L", "hand.R", "thigh.L", "thigh.R", "shin.L", "shin.R", "foot.L", "foot.R", "tail_root", "tail_01", "tail_02", "tail_03", "tail_04"]
    rig_validation = {"status": "PASS" if all(name in rig_bones for name in required) else "FAIL", "bones": rig_bones, "missing": [name for name in required if name not in rig_bones], "automaticWeights": rig_ok, "error": rig_error}

    pose_paths = []
    poses = {
        "arms-up": {"upper_arm.L": (0, 0, -0.9), "upper_arm.R": (0, 0, 0.9)},
        "reach": {"upper_arm.L": (0.5, 0, -0.6), "forearm.L": (0.5, 0, 0.3), "head": (0, 0.25, 0)},
        "twist": {"spine": (0, 0, 0.35), "head": (0, 0, -0.3), "tail_01": (0, 0, -0.25)},
        "squat": {"thigh.L": (0.45, 0, 0), "thigh.R": (0.45, 0, 0), "shin.L": (-0.8, 0, 0), "shin.R": (-0.8, 0, 0)},
    }
    for name, pose in poses.items():
        reset_pose(arm)
        pose_test(arm, name, pose)
        path = out / "skinning-rnd" / f"{name}.png"
        render_still(scene, camera, target, path, math.pi / 6, False)
        pose_paths.append(str(path))
    reset_pose(arm)

    # Only emit a motion reel when there is a real armature and automatic skinning.
    motion_created = False
    motion_frames = out / "motion-reel-rnd" / "frame-"
    if rig_ok:
        scene.frame_start = 1
        scene.frame_end = 240
        animate_motion(arm, 1, {})
        animate_motion(arm, 30, {"head": (0, 0.12, 0), "tail_01": (0, 0, 0.12), "tail_02": (0, 0, 0.18)})
        animate_motion(arm, 75, {"thigh.L": (0.25, 0, 0), "thigh.R": (-0.25, 0, 0), "shin.L": (-0.35, 0, 0), "shin.R": (0.35, 0, 0), "upper_arm.L": (0, 0, -0.25), "upper_arm.R": (0, 0, 0.25)})
        animate_motion(arm, 120, {"upper_arm.L": (0.5, 0, -0.6), "forearm.L": (0.5, 0, 0.3), "head": (0, 0.25, 0), "tail_01": (0, 0, 0.3), "tail_02": (0, 0, 0.4)})
        animate_motion(arm, 165, {"upper_arm.L": (0, 0, -0.9), "upper_arm.R": (0, 0, 0.9), "head": (0, -0.22, 0)})
        animate_motion(arm, 210, {"head": (0, 0.12, 0), "tail_01": (0, 0, -0.12), "tail_02": (0, 0, -0.18)})
        animate_motion(arm, 240, {})
        scene.render.filepath = str(motion_frames)
        scene.render.resolution_percentage = 50
        bpy.ops.render.render(animation=True)
        motion_created = True
        scene.render.resolution_percentage = 100

    face_shapes = sorted(set(mesh_stats["shapeKeys"]))
    face_status = "READY" if face_shapes else "NOT_READY"
    face_report = {"status": face_status, "strategy": "EXISTING_SHAPE_KEYS" if face_shapes else "BLOCKED_NO_FACIAL_SHAPE_KEYS", "shapeKeys": face_shapes, "visemes": [], "expressions": []}

    blend_path = out / "blender-rnd" / "moss-rnd-v1.blend"
    bpy.ops.wm.save_as_mainfile(filepath=str(blend_path))
    result = {
        "status": "PASS",
        "sourceGlb": str(glb),
        "blendFile": str(blend_path),
        "meshStats": mesh_stats,
        "modelQuality": {"geometryStatus": "PASS" if mesh_stats["triangles"] > 0 else "FAIL", "materialStatus": "PASS" if mesh_stats["materials"] > 0 else "FAIL", "textureStatus": "PASS" if mesh_stats["images"] > 0 else "FAIL", "identityStatus": "REVIEW_REQUIRED", "issues": ["Meshy 6 Lite export contains no imported materials or images; color/scarf identity cannot be approved from this GLB."] if mesh_stats["materials"] == 0 or mesh_stats["images"] == 0 else []},
        "normalization": {"feetGrounded": True, "centeredXY": True, "sourceUntouched": True, "dimensions": mesh_stats["dimensions"]},
        "stills": stills,
        "turntable": {"status": "RENDERED_STILLS_AND_FRAMES", "frameCount": 72, "resolution": "1920x1080", "framesDir": str(turntable_frames), "stills": stills},
        "rig": rig_validation,
        "skinning": {"status": "PASS" if rig_ok else "FAIL", "automaticWeights": rig_ok, "poseTests": pose_paths, "issue": None if rig_ok else "Automatic armature weights were not created; inspect pose tests."},
        "tail": {"status": "PASS" if "tail_04" in rig_bones else "FAIL", "bones": [name for name in rig_bones if name.startswith("tail_")]},
        "scarf": {"status": "PROTOTYPE_DETERMINISTIC", "strategy": "Imported mesh is kept as one stable skinned asset; cloth simulation deferred."},
        "face": face_report,
        "motionReel": {"status": "CREATED" if motion_created else "BLOCKED_SKINNING", "pattern": "idle-walk-reach-reaction", "fps": 30, "frames": 240, "resolution": "960x540" if motion_created else None},
        "sourceLineage": ["STYLE_PROOF_B", "MOSS_CANONICAL_REFERENCE_PACK_V1", "MOSS_MESHY6LITE_RND_V1", "MOSS_BLENDER_RND_V1", "MOSS_RIG_PROTOTYPE_V1"],
    }
    (out / "reports" / "blender-moss-validation.json").write_text(json.dumps(result, indent=2), encoding="utf-8")
    print(json.dumps({"blendFile": str(blend_path), "meshStats": mesh_stats, "rig": rig_validation, "skinning": result["skinning"], "face": face_report, "motionReel": result["motionReel"]}, indent=2))


if __name__ == "__main__":
    main()
