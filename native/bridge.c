/* Copyright 2026 Plasius LTD. SPDX-License-Identifier: Apache-2.0 */
#include "ufbx.h"
#include <stdlib.h>
#include <string.h>
#include <math.h>
#ifdef __EMSCRIPTEN__
#include <emscripten.h>
EM_JS(int, deadline_ok, (), {
  return performance.now() <= Module['deadline'] &&
    (!Module['cancelWord'] || Atomics.load(Module['cancelWord'], 0) === 0);
});
#else
static int native_continue = 1;
int deadline_ok(void) { return native_continue; }
void fbx_test_continue(int value) { native_continue = value; }
#endif

/* One invocation per worker. These output buffers have a fixed, non-growing size. */
static float positions[90000];
static double header[8];
static char mesh_name[513];
static unsigned name_size;
static size_t live_bytes, attempts, memory_ceiling, allocation_ceiling;
static int budget_failed;

static void *bounded_realloc(void *user, void *old, size_t old_size, size_t size) {
  (void)user;
  if (!size) { free(old); live_bytes -= old_size; return NULL; }
  if (++attempts > allocation_ceiling || size > memory_ceiling - (live_bytes - old_size)) {
    budget_failed = 1;
    return NULL;
  }
  void *next = realloc(old, size);
  if (next) live_bytes = live_bytes - old_size + size;
  else budget_failed = 1;
  return next;
}
static ufbx_progress_result progress(void *user, const ufbx_progress *p) {
  (void)user; (void)p;
  return deadline_ok() ? UFBX_PROGRESS_CONTINUE : UFBX_PROGRESS_CANCEL;
}
double *fbx_header(void) { return header; }
float *fbx_output(void) { return positions; }
char *fbx_name(void) { return mesh_name; }
unsigned fbx_name_size(void) { return name_size; }
unsigned fbx_outstanding(void) { return (unsigned)live_bytes; }

/* Safe codes only: no upstream exception strings, model text or resource paths. */
int fbx_parse(const void *bytes, unsigned length, unsigned memory_limit, unsigned allocation_limit) {
  memset(header, 0, sizeof(header)); name_size = 0;
  if (live_bytes || !length || length > 8388608 || !memory_limit || memory_limit > 25165824 ||
      !allocation_limit || allocation_limit > 50000) return 3;
  memory_ceiling = memory_limit; allocation_ceiling = allocation_limit; attempts = 0; budget_failed = 0;
  ufbx_load_opts opts = {0};
  opts.temp_allocator.allocator.realloc_fn = bounded_realloc;
  opts.result_allocator.allocator.realloc_fn = bounded_realloc;
  opts.temp_allocator.memory_limit = opts.result_allocator.memory_limit = memory_limit;
  opts.temp_allocator.allocation_limit = opts.result_allocator.allocation_limit = allocation_limit;
  opts.strict = true; opts.force_single_thread_ascii_parsing = true;
  opts.file_format = UFBX_FILE_FORMAT_FBX; opts.load_external_files = false;
  opts.node_depth_limit = 64; opts.progress_cb.fn = progress; opts.progress_interval_hint = 1024;
  opts.target_axes = ufbx_axes_right_handed_y_up; opts.target_unit_meters = 1.0;
  opts.index_error_handling = UFBX_INDEX_ERROR_HANDLING_ABORT_LOADING;
  ufbx_error error;
  ufbx_scene *scene = ufbx_load_memory(bytes, length, &opts, &error);
  if (!scene) return budget_failed || error.type == UFBX_ERROR_MEMORY_LIMIT || error.type == UFBX_ERROR_ALLOCATION_LIMIT ? 3 : error.type == UFBX_ERROR_CANCELLED ? 4 : 1;
  int result = 2;
  if (!deadline_ok()) { result = 4; goto done; }
  if (scene->metadata.version != 7400 || !ufbx_coordinate_axes_valid(scene->settings.axes) ||
      !isfinite(scene->settings.unit_meters) || scene->settings.unit_meters <= 0) goto done;
  for (size_t i = 0; i < scene->elements.count; ++i) {
    ufbx_element *element = scene->elements.data[i];
    if (element->type != UFBX_ELEMENT_NODE && element->type != UFBX_ELEMENT_MESH) goto done;
    for (size_t j = 0; j < element->props.props.count; ++j)
      if (element->props.props.data[j].flags & UFBX_PROP_FLAG_USER_DEFINED) goto done;
  }
  if (scene->metadata.warnings.count || scene->meshes.count != 1 || scene->nodes.count != 2 ||
      scene->materials.count || scene->textures.count || scene->skin_deformers.count ||
      scene->blend_deformers.count || scene->anim_stacks.count || scene->cameras.count || scene->lights.count ||
      scene->root_node->children.count != 1) goto done;
  ufbx_node *node = scene->root_node->children.data[0];
  ufbx_mesh *mesh = node->mesh;
  if (!mesh || node->children.count || mesh->instances.count != 1 || !mesh->num_faces ||
      mesh->num_faces != mesh->num_triangles || mesh->vertex_normal.exists || mesh->vertex_uv.exists ||
      mesh->vertex_color.exists || mesh->vertex_tangent.exists || mesh->vertex_bitangent.exists ||
      mesh->name.length > 512 || node->name.length > 512) goto done;
  if (mesh->num_triangles > 10000) { result = 3; goto done; }
  ufbx_matrix m = node->geometry_to_world;
  double det = m.m00*(m.m11*m.m22-m.m12*m.m21)-m.m01*(m.m10*m.m22-m.m12*m.m20)+m.m02*(m.m10*m.m21-m.m11*m.m20);
  if (!isfinite(det) || det == 0.0) goto done;
  unsigned cursor = 0;
  for (size_t face_index = 0; face_index < mesh->faces.count; ++face_index) {
    if (!deadline_ok()) { result = 4; goto done; }
    ufbx_face face = mesh->faces.data[face_index];
    if (face.num_indices != 3) goto done;
    for (unsigned j = 0; j < 3; ++j) {
      unsigned order = det < 0.0 && j > 0 ? 3-j : j;
      ufbx_vec3 p = ufbx_get_vertex_vec3(&mesh->vertex_position, face.index_begin + order);
      p = ufbx_transform_position(&m, p);
      if (!isfinite(p.x) || !isfinite(p.y) || !isfinite(p.z) || fabs(p.x)>1000000 || fabs(p.y)>1000000 || fabs(p.z)>1000000) goto done;
      positions[cursor++] = (float)p.x; positions[cursor++] = (float)p.y; positions[cursor++] = (float)p.z;
    }
  }
  header[0] = cursor / 3; header[1] = scene->metadata.version; header[2] = scene->metadata.ascii;
  header[3] = scene->settings.unit_meters;
  header[4] = scene->settings.axes.right; header[5] = scene->settings.axes.up; header[6] = scene->settings.axes.front;
  name_size = (unsigned)node->name.length; memcpy(mesh_name, node->name.data, name_size);
  result = 0;
done:
  ufbx_free_scene(scene);
  if (result) { memset(header, 0, sizeof(header)); name_size = 0; }
  return result;
}
