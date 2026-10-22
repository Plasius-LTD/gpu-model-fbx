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

/* Fixed output tables: at most64 source nodes,128 material groups,32 materials,
 * 10000 triangles/30000 corners. No pointer survives ufbx_free_scene(). */
#define NODE_STRIDE 67
#define PRIMITIVE_STRIDE 6
#define MATERIAL_STRIDE 126
static float positions[90000], normals[90000], uvs[60000];
static double header[10], nodes[64*NODE_STRIDE], primitives[128*PRIMITIVE_STRIDE], materials[32*MATERIAL_STRIDE];
static char node_names[64][513], mesh_names[64][513], material_names[32][513], material_shaders[32][129];
static size_t live_bytes, attempts, memory_ceiling, allocation_ceiling;
static int budget_failed;
static const char *transform_props[] = { "Lcl Translation", "Lcl Rotation", "Lcl Scaling", "PreRotation", "PostRotation", "RotationOffset", "RotationPivot", "ScalingOffset", "ScalingPivot", "GeometricTranslation", "GeometricRotation", "GeometricScaling" };

static void *bounded_realloc(void *user, void *old, size_t old_size, size_t size) {
  (void)user;
  if (!size) { free(old); live_bytes -= old_size; return NULL; }
  if (++attempts > allocation_ceiling || size > memory_ceiling - (live_bytes - old_size)) { budget_failed = 1; return NULL; }
  void *next = realloc(old, size);
  if (next) live_bytes = live_bytes - old_size + size;
  else budget_failed = 1;
  return next;
}
static ufbx_progress_result progress(void *user, const ufbx_progress *p) {
  (void)user; (void)p; return deadline_ok() ? UFBX_PROGRESS_CONTINUE : UFBX_PROGRESS_CANCEL;
}
double *fbx_header(void) { return header; }
float *fbx_output(void) { return positions; }
float *fbx_normals(void) { return normals; }
float *fbx_uvs(void) { return uvs; }
double *fbx_nodes(void) { return nodes; }
double *fbx_primitives(void) { return primitives; }
double *fbx_materials(void) { return materials; }
char *fbx_node_names(void) { return node_names[0]; }
char *fbx_material_names(void) { return material_names[0]; }
char *fbx_mesh_names(void) { return mesh_names[0]; }
char *fbx_material_shaders(void) { return material_shaders[0]; }
unsigned fbx_outstanding(void) { return (unsigned)live_bytes; }
static double determinant(ufbx_matrix m) {
  return m.m00*(m.m11*m.m22-m.m12*m.m21)-m.m01*(m.m10*m.m22-m.m12*m.m20)+m.m02*(m.m10*m.m21-m.m11*m.m20);
}
static int finite_vec3(ufbx_vec3 v) {
  return isfinite(v.x) && isfinite(v.y) && isfinite(v.z) && fabs(v.x)<=1000000 && fabs(v.y)<=1000000 && fabs(v.z)<=1000000;
}
static int copy_matrix(double *out, ufbx_matrix m) {
  for (unsigned i=0;i<12;i++) { if (!isfinite(m.v[i]) || fabs(m.v[i])>1000000) return 0; out[i]=m.v[i]; } return 1;
}
static int node_index(ufbx_scene *scene, ufbx_node *node) {
  if (node == scene->root_node) return -1;
  for (size_t i=1;i<scene->nodes.count;i++) if (scene->nodes.data[i]==node) return (int)i-1;
  return -2;
}
/* Safe finite codes; no upstream exception strings, source text or resource paths. */
int fbx_parse(const void *bytes, unsigned length, unsigned memory_limit, unsigned allocation_limit) {
  memset(header,0,sizeof(header));
  if (live_bytes || !length || length>8388608 || !memory_limit || memory_limit>25165824 || !allocation_limit || allocation_limit>50000) return 3;
  memory_ceiling=memory_limit; allocation_ceiling=allocation_limit; attempts=0; budget_failed=0;
  ufbx_load_opts opts={0};
  opts.temp_allocator.allocator.realloc_fn=bounded_realloc; opts.result_allocator.allocator.realloc_fn=bounded_realloc;
  opts.temp_allocator.memory_limit=opts.result_allocator.memory_limit=memory_limit;
  opts.temp_allocator.allocation_limit=opts.result_allocator.allocation_limit=allocation_limit;
  opts.strict=true; opts.force_single_thread_ascii_parsing=true;
  opts.file_format=UFBX_FILE_FORMAT_FBX; opts.load_external_files=false;
  opts.node_depth_limit=64; opts.progress_cb.fn=progress; opts.progress_interval_hint=1024;
  opts.target_axes=ufbx_axes_right_handed_y_up; opts.target_unit_meters=1.0;
  opts.handedness_conversion_retain_winding=true;
  opts.index_error_handling=UFBX_INDEX_ERROR_HANDLING_ABORT_LOADING;
  ufbx_error error;
  ufbx_scene *scene=ufbx_load_memory(bytes,length,&opts,&error);
  if (!scene) return budget_failed || error.type==UFBX_ERROR_MEMORY_LIMIT || error.type==UFBX_ERROR_ALLOCATION_LIMIT ? 3 : error.type==UFBX_ERROR_CANCELLED ? 4 : 1;
  int result=2; unsigned cursor=0, primitive_count=0;
  if (!deadline_ok()) { result=4; goto done; }
  if (scene->metadata.version!=7400 || !ufbx_coordinate_axes_valid(scene->settings.axes) || !isfinite(scene->settings.unit_meters) || scene->settings.unit_meters<=0 || scene->metadata.warnings.count) goto done;
  if (scene->nodes.count<2 || !scene->meshes.count || scene->nodes.data[0]!=scene->root_node) goto done;
  if (scene->nodes.count>65 || scene->materials.count>32) { result=3; goto done; }
  for (size_t i=0;i<scene->meshes.count;i++) if (!scene->meshes.data[i]->instances.count) goto done;
  for (size_t i=0;i<scene->elements.count;i++) {
    ufbx_element *element=scene->elements.data[i];
    if (element->type!=UFBX_ELEMENT_NODE && element->type!=UFBX_ELEMENT_MESH && element->type!=UFBX_ELEMENT_MATERIAL) goto done;
    for (size_t j=0;j<element->props.props.count;j++) if (element->props.props.data[j].flags & UFBX_PROP_FLAG_USER_DEFINED) goto done;
  }
  for (size_t mi=0;mi<scene->materials.count;mi++) {
    ufbx_material *material=scene->materials.data[mi]; double *out=&materials[mi*MATERIAL_STRIDE];
    if (material->name.length>512 || memchr(material->name.data,0,material->name.length) || material->shading_model_name.length>128 || material->textures.count) goto done;
    memset(out,0,MATERIAL_STRIDE*sizeof(double));
    out[0]=material->shader_type;
    out[1]=material->fbx.diffuse_factor.value_real;
    out[2]=material->fbx.diffuse_color.value_vec3.x; out[3]=material->fbx.diffuse_color.value_vec3.y; out[4]=material->fbx.diffuse_color.value_vec3.z;
    out[5]=material->pbr.opacity.has_value ? material->pbr.opacity.value_real : 1;
    for (unsigned j=0;j<UFBX_MATERIAL_FBX_MAP_COUNT;j++) {
      ufbx_material_map map=material->fbx.maps[j];
      out[6+j*6]=map.has_value; out[7+j*6]=map.value_components;
      for (unsigned k=0;k<4;k++) { double v=map.value_vec4.v[k]; if (!isfinite(v) || fabs(v)>1000000) goto done; out[8+j*6+k]=v; }
    }
    for (unsigned j=1;j<6;j++) if (!isfinite(out[j]) || fabs(out[j])>1000000) goto done;
    memcpy(material_names[mi],material->name.data,material->name.length); material_names[mi][material->name.length]=0;
    if (memchr(material->shading_model_name.data,0,material->shading_model_name.length)) goto done;
    memcpy(material_shaders[mi],material->shading_model_name.data,material->shading_model_name.length); material_shaders[mi][material->shading_model_name.length]=0;
  }
  for (size_t ni=1;ni<scene->nodes.count;ni++) {
    ufbx_node *node=scene->nodes.data[ni]; double *out=&nodes[(ni-1)*NODE_STRIDE];
    memset(out,0,NODE_STRIDE*sizeof(double));
    if (!deadline_ok()) { result=4; goto done; }
    if (node->name.length>512 || memchr(node->name.data,0,node->name.length) || node->all_attribs.count>(node->mesh ? 1 : 0)) goto done;
    int parent=node_index(scene,node->parent); if (parent < -1) goto done;
    out[0]=parent; out[1]=primitive_count; out[2]=0;
    ufbx_matrix local=node->node_to_world;
    if (parent>=0) { if (fabs(determinant(node->parent->node_to_world))<1e-12) goto done; ufbx_matrix inverse=ufbx_matrix_invert(&node->parent->node_to_world); local=ufbx_matrix_mul(&inverse,&node->node_to_world); }
    if (!copy_matrix(out+3,local) || !copy_matrix(out+15,node->geometry_to_node) || fabs(determinant(node->node_to_world))<1e-12) goto done;
    for (unsigned j=0;j<12;j++) {
      ufbx_prop *prop=ufbx_find_prop(&node->props,transform_props[j]);
      for (unsigned k=0;k<3;k++) { double v=prop ? prop->value_vec3.v[k] : (j==2 || j==11 ? 1 : 0); if (!isfinite(v) || fabs(v)>100000000) goto done; out[27+j*3+k]=v; }
    }
    ufbx_prop *inherit=ufbx_find_prop(&node->props,"InheritType"); out[63]=inherit ? inherit->value_int : 0;
    out[64]=node->rotation_order; out[65]=node->original_inherit_mode; out[66]=node->mesh ? (double)node->mesh->typed_id : -1;
    memcpy(node_names[ni-1],node->name.data,node->name.length); node_names[ni-1][node->name.length]=0;
    mesh_names[ni-1][0]=0;
    ufbx_mesh *mesh=node->mesh; if (!mesh) continue;
    if (mesh->name.length>512 || memchr(mesh->name.data,0,mesh->name.length)) goto done;
    memcpy(mesh_names[ni-1],mesh->name.data,mesh->name.length); mesh_names[ni-1][mesh->name.length]=0;
    if (!mesh->num_faces || mesh->vertex_color.exists || mesh->vertex_tangent.exists || mesh->vertex_bitangent.exists || mesh->uv_sets.count>1 || mesh->skin_deformers.count || mesh->blend_deformers.count) goto done;
    if (mesh->num_triangles>10000 || cursor/3+mesh->num_triangles*3>30000) { result=3; goto done; }
    double det=determinant(node->geometry_to_world); if (!isfinite(det) || fabs(det)<1e-12) goto done;
    ufbx_matrix normal_matrix=ufbx_matrix_for_normals(&node->geometry_to_node);
    /* Group by the instance's material slot; corner indices preserve seams. */
    size_t groups=node->materials.count ? node->materials.count : 1;
    if (groups>32) { result=3; goto done; }
    for (size_t group=0;group<groups;group++) {
      unsigned begin=cursor/3;
      for (size_t fi=0;fi<mesh->faces.count;fi++) {
        if (!deadline_ok()) { result=4; goto done; }
        ufbx_face face=mesh->faces.data[fi]; if (face.num_indices<3 || face.num_indices>64) goto done;
        if (node->materials.count) { if (mesh->face_material.count!=mesh->faces.count || mesh->face_material.data[fi]>=groups) goto done; if (mesh->face_material.data[fi]!=group) continue; }
        uint32_t corners[186]; unsigned count=ufbx_triangulate_face(corners,186,mesh,face)*3;
        if (!count || count>186 || cursor+count*3>90000) { result=3; goto done; }
        for (unsigned ti=0;ti<count;ti+=3) for (unsigned j=0;j<3;j++) {
          unsigned index=corners[ti+(det<0 && j>0 ? 3-j : j)];
          ufbx_vec3 p=ufbx_transform_position(&node->geometry_to_node,ufbx_get_vertex_vec3(&mesh->vertex_position,index));
          ufbx_vec3 w=ufbx_transform_position(&node->node_to_world,p); if (!finite_vec3(p) || !finite_vec3(w)) goto done;
          positions[cursor]=(float)p.x; positions[cursor+1]=(float)p.y; positions[cursor+2]=(float)p.z;
          if (mesh->vertex_normal.exists) {
            ufbx_vec3 n=ufbx_transform_direction(&normal_matrix,ufbx_get_vertex_vec3(&mesh->vertex_normal,index));
            double len=sqrt(n.x*n.x+n.y*n.y+n.z*n.z); if (!isfinite(len) || len<1e-12) goto done;
            normals[cursor]=(float)(n.x/len); normals[cursor+1]=(float)(n.y/len); normals[cursor+2]=(float)(n.z/len);
          } else normals[cursor]=normals[cursor+1]=normals[cursor+2]=0;
          unsigned uv=cursor/3*2;
          if (mesh->vertex_uv.exists) { ufbx_vec2 v=ufbx_get_vertex_vec2(&mesh->vertex_uv,index); if (!isfinite(v.x) || !isfinite(v.y) || fabs(v.x)>1000000 || fabs(v.y)>1000000) goto done; uvs[uv]=(float)v.x; uvs[uv+1]=(float)v.y; }
          else uvs[uv]=uvs[uv+1]=0;
          cursor+=3;
        }
      }
      if (cursor/3==begin) continue;
      if (primitive_count>=128) { result=3; goto done; }
      double *prim=&primitives[primitive_count++*PRIMITIVE_STRIDE];
      prim[0]=ni-1; prim[1]=begin; prim[2]=cursor/3-begin;
      prim[3]=node->materials.count ? (double)node->materials.data[group]->typed_id : -1;
      prim[4]=mesh->vertex_normal.exists; prim[5]=mesh->vertex_uv.exists; out[2]++;
    }
  }
  if (!cursor) goto done;
  header[0]=cursor/3; header[1]=scene->metadata.version; header[2]=scene->metadata.ascii; header[3]=scene->settings.unit_meters;
  header[4]=scene->settings.axes.right; header[5]=scene->settings.axes.up; header[6]=scene->settings.axes.front;
  header[7]=scene->nodes.count-1; header[8]=primitive_count; header[9]=scene->materials.count; result=0;
done:
  ufbx_free_scene(scene); if (result) memset(header,0,sizeof(header)); return result;
}
