import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { View, Text, SectionList, TouchableOpacity, TextInput, StyleSheet, Alert, Modal, ScrollView, ActivityIndicator, RefreshControl, Switch } from 'react-native';
import { useState, useMemo, useCallback } from 'react';
import { router } from 'expo-router';
import api from '../../src/lib/api';

interface Category {
  id: string;
  name: string;
  icon?: string;
  isDefault?: boolean;
}

interface AppTemplate {
  id: string;
  name: string;
  categoryId: string;
  isDefault: boolean;
}

interface App {
  id: string;
  templateId: string;
  template?: { id: string; name: string; category?: { id: string; name: string; icon?: string } };
  notes?: string;
  active: boolean;
  _count?: { durations: number };
  accountCount?: number;
  stockAvailable?: number;
  stockLocked?: number;
  stockSold?: number;
  expiredCount?: number;
  pendingWarrantyCount?: number;
  loginReportCount?: number;
}

export default function ProductsScreen() {
  const queryClient = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [showCatPicker, setShowCatPicker] = useState(false);
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showTemplatePicker, setShowTemplatePicker] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('');
  const [customName, setCustomName] = useState('');
  const [form, setForm] = useState({ categoryId: '', templateId: '', notes: '' });
  const [editingApp, setEditingApp] = useState<App | null>(null);
  const [editNotes, setEditNotes] = useState('');
  const [editActive, setEditActive] = useState(true);
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editTemplateId, setEditTemplateId] = useState('');
  const [editCustomName, setEditCustomName] = useState('');
  const [showEditCatPicker, setShowEditCatPicker] = useState(false);
  const [showEditTemplatePicker, setShowEditTemplatePicker] = useState(false);

  const { data: apps, isLoading, refetch } = useQuery<App[]>({
    queryKey: ['seller-apps'],
    queryFn: () => api.get('/seller/apps').then((r) => r.data),
  });

  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  }, [refetch]);

  const { data: categories, isLoading: catsLoading } = useQuery<Category[]>({
    queryKey: ['seller-categories'],
    queryFn: () => api.get('/seller/categories').then((r) => r.data),
    enabled: showAdd || !!editingApp,
  });

  const { data: templates, isLoading: templatesLoading } = useQuery<AppTemplate[]>({
    queryKey: ['seller-templates', form.categoryId],
    queryFn: () => api.get(`/seller/templates?categoryId=${form.categoryId}`).then((r) => r.data),
    enabled: !!form.categoryId,
  });

  const { data: editTemplates, isLoading: editTemplatesLoading } = useQuery<AppTemplate[]>({
    queryKey: ['seller-templates', editCategoryId],
    queryFn: () => api.get(`/seller/templates?categoryId=${editCategoryId}`).then((r) => r.data),
    enabled: !!editCategoryId,
  });

  const addApp = useMutation({
    mutationFn: (data: { templateId?: string; categoryId?: string; name?: string; notes?: string }) =>
      api.post('/seller/apps', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-apps'] });
      setShowAdd(false);
      setForm({ categoryId: '', templateId: '', notes: '' });
      setCustomName('');
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  const updateApp = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { active?: boolean; notes?: string; templateId?: string; categoryId?: string; name?: string } }) =>
      api.patch(`/seller/apps/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-apps'] });
      setEditingApp(null);
      setEditNotes('');
      setEditCategoryId('');
      setEditTemplateId('');
      setEditCustomName('');
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  const deleteApp = useMutation({
    mutationFn: (id: string) => api.delete(`/seller/apps/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['seller-apps'] });
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  const addCategory = useMutation({
    mutationFn: (data: { name: string; icon?: string }) =>
      api.post('/seller/categories', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['seller-categories'] });
      setForm({ ...form, categoryId: res.data.id, templateId: '' });
      setCustomName('');
      setShowAddCategory(false);
      setShowCatPicker(false);
      setNewCatName('');
      setNewCatIcon('');
    },
    onError: (err: any) => Alert.alert('Gagal', err.response?.data?.message || 'Error'),
  });

  const handleSubmit = () => {
    if (!form.templateId && !customName.trim()) {
      Alert.alert('Error', 'Pilih template atau masukkan nama aplikasi');
      return;
    }
    if (!form.templateId && !form.categoryId) {
      Alert.alert('Error', 'Pilih kategori terlebih dahulu');
      return;
    }

    if (form.templateId) {
      addApp.mutate({
        templateId: form.templateId,
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      });
    } else {
      addApp.mutate({
        categoryId: form.categoryId,
        name: customName.trim(),
        ...(form.notes.trim() ? { notes: form.notes.trim() } : {}),
      });
    }
  };

  const handleAddCategory = () => {
    if (!newCatName.trim()) {
      Alert.alert('Error', 'Nama kategori harus diisi');
      return;
    }
    addCategory.mutate({
      name: newCatName.trim(),
      ...(newCatIcon.trim() ? { icon: newCatIcon.trim() } : {}),
    });
  };

  const handleEditApp = (app: App) => {
    setEditingApp(app);
    setEditNotes(app.notes || '');
    setEditActive(app.active);
    setEditCategoryId(app.template?.category?.id || '');
    setEditTemplateId(app.templateId || '');
    setEditCustomName('');
    setShowEditCatPicker(false);
    setShowEditTemplatePicker(false);
  };

  const handleEditSubmit = () => {
    if (!editingApp) return;
    const data: any = {
      active: editActive,
      notes: editNotes.trim() || undefined,
    };
    // If template changed
    if (editTemplateId && editTemplateId !== editingApp.templateId) {
      data.templateId = editTemplateId;
    } else if (editCustomName.trim() && editCategoryId) {
      data.categoryId = editCategoryId;
      data.name = editCustomName.trim();
    }
    updateApp.mutate({ id: editingApp.id, data });
  };

  const handleDeleteApp = (app: App) => {
    const appName = app.template?.name || 'aplikasi ini';
    Alert.alert('Hapus Aplikasi', `Yakin ingin menghapus ${appName}?`, [
      { text: 'Batal', style: 'cancel' },
      { text: 'Hapus', style: 'destructive', onPress: () => deleteApp.mutate(app.id) },
    ]);
  };

  const sections = useMemo(() => {
    if (!apps) return [];
    const groups: Record<string, { icon?: string; apps: App[] }> = {};
    apps.forEach((app) => {
      const catName = app.template?.category?.name || 'Lainnya';
      const catIcon = app.template?.category?.icon || '';
      if (!groups[catName]) groups[catName] = { icon: catIcon, apps: [] };
      groups[catName].apps.push(app);
    });
    return Object.entries(groups).map(([title, { icon, apps: data }]) => ({
      title: `${icon ? icon + ' ' : ''}${title}`,
      data,
    }));
  }, [apps]);

  const selectedCategory = categories?.find((c) => c.id === form.categoryId);
  const selectedTemplate = templates?.find((t) => t.id === form.templateId);

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.addBtn} onPress={() => setShowAdd(true)}>
        <Text style={styles.addBtnText}>+ Tambah Aplikasi</Text>
      </TouchableOpacity>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderSectionHeader={({ section: { title } }) => (
          <Text style={styles.sectionHeader}>{title}</Text>
        )}
        renderItem={({ item }) => {
          const appName = item.template?.name || '-';
          const durationCount = item._count?.durations ?? 0;
          const accountCount = item.accountCount ?? 0;
          const stockAvailable = item.stockAvailable ?? 0;
          const stockLocked = item.stockLocked ?? 0;
          const stockSold = item.stockSold ?? 0;
          const expiredCount = item.expiredCount ?? 0;
          const pendingWarrantyCount = item.pendingWarrantyCount ?? 0;
          const loginReportCount = item.loginReportCount ?? 0;
          const cardBorderStyle = {
            ...(expiredCount > 0 ? { borderLeftWidth: 3, borderLeftColor: '#ef4444' } : {}),
            ...(pendingWarrantyCount > 0 ? { borderRightWidth: 3, borderRightColor: '#3b82f6' } : {}),
            ...(loginReportCount > 0 ? { borderBottomWidth: 3, borderBottomColor: '#f97316' } : {}),
          };
          return (
            <TouchableOpacity
              style={[styles.card, !item.active && styles.cardInactive, cardBorderStyle]}
              onPress={() =>
                router.push({
                  pathname: '/(seller)/app-detail',
                  params: { appId: item.id, appName },
                })
              }
            >
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>{appName}</Text>
                <View style={styles.actionRow}>
                  <TouchableOpacity onPress={() => handleEditApp(item)} style={styles.actionBtn}>
                    <Text style={styles.editBtnText}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteApp(item)} style={styles.actionBtn}>
                    <Text style={styles.deleteBtnText}>Hapus</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <Text style={styles.cardMeta}>{durationCount} durasi | {accountCount} akun</Text>
              <Text style={styles.cardStock}>
                Tersedia: {stockAvailable} | Terkunci: {stockLocked} | Terjual: {stockSold}
              </Text>
              {expiredCount > 0 && (
                <Text style={styles.expiredBadge}>{expiredCount} kadaluarsa</Text>
              )}
              {pendingWarrantyCount > 0 && (
                <Text style={styles.warrantyBadge}>{pendingWarrantyCount} verifikasi</Text>
              )}
              {loginReportCount > 0 && (
                <Text style={styles.loginReportBadge}>{loginReportCount} laporan login</Text>
              )}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={
          <Text style={styles.empty}>{isLoading ? 'Memuat...' : 'Belum ada aplikasi'}</Text>
        }
      />

      {/* Modal Edit Aplikasi */}
      <Modal visible={!!editingApp} animationType="slide" transparent>
        <View style={styles.modal}>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>Edit Aplikasi</Text>
            <View style={styles.switchRow}>
              <Text style={styles.label}>Aktif</Text>
              <Switch value={editActive} onValueChange={setEditActive} />
            </View>

            {/* Kategori Selector */}
            <Text style={styles.label}>Kategori</Text>
            <TouchableOpacity
              style={styles.dropdown}
              onPress={() => { setShowEditCatPicker(!showEditCatPicker); setShowEditTemplatePicker(false); }}
            >
              <Text style={editCategoryId ? styles.dropdownText : styles.dropdownPlaceholder}>
                {(() => {
                  const cat = categories?.find((c) => c.id === editCategoryId);
                  return cat ? `${cat.icon ? cat.icon + ' ' : ''}${cat.name}` : 'Pilih kategori...';
                })()}
              </Text>
              <Text style={styles.dropdownArrow}>{showEditCatPicker ? '^' : 'v'}</Text>
            </TouchableOpacity>

            {showEditCatPicker && (
              <View style={styles.dropdownContainer}>
                <ScrollView style={styles.dropdownList} nestedScrollEnabled>
                  {catsLoading ? (
                    <ActivityIndicator style={{ padding: 16 }} />
                  ) : (
                    categories?.map((cat) => (
                      <TouchableOpacity
                        key={cat.id}
                        style={[styles.dropdownItem, editCategoryId === cat.id && styles.dropdownItemSelected]}
                        onPress={() => {
                          setEditCategoryId(cat.id);
                          setEditTemplateId('');
                          setEditCustomName('');
                          setShowEditCatPicker(false);
                        }}
                      >
                        <Text style={[styles.dropdownItemText, editCategoryId === cat.id && styles.dropdownItemTextSelected]}>
                          {cat.icon ? `${cat.icon} ` : ''}{cat.name}
                        </Text>
                      </TouchableOpacity>
                    ))
                  )}
                </ScrollView>
              </View>
            )}

            {/* Template Selector */}
            {editCategoryId ? (
              <>
                <Text style={styles.label}>Aplikasi</Text>
                <TouchableOpacity
                  style={styles.dropdown}
                  onPress={() => setShowEditTemplatePicker(!showEditTemplatePicker)}
                >
                  <Text style={editTemplateId ? styles.dropdownText : styles.dropdownPlaceholder}>
                    {(() => {
                      const tpl = editTemplates?.find((t) => t.id === editTemplateId);
                      return tpl ? tpl.name : 'Pilih aplikasi...';
                    })()}
                  </Text>
                  <Text style={styles.dropdownArrow}>{showEditTemplatePicker ? '^' : 'v'}</Text>
                </TouchableOpacity>

                {showEditTemplatePicker && (
                  <View style={styles.dropdownContainer}>
                    <ScrollView style={styles.dropdownList} nestedScrollEnabled>
                      {editTemplatesLoading ? (
                        <ActivityIndicator style={{ padding: 16 }} />
                      ) : (
                        editTemplates?.map((tpl) => (
                          <TouchableOpacity
                            key={tpl.id}
                            style={[styles.dropdownItem, editTemplateId === tpl.id && styles.dropdownItemSelected]}
                            onPress={() => {
                              setEditTemplateId(tpl.id);
                              setEditCustomName('');
                              setShowEditTemplatePicker(false);
                            }}
                          >
                            <Text style={[styles.dropdownItemText, editTemplateId === tpl.id && styles.dropdownItemTextSelected]}>
                              {tpl.name}
                            </Text>
                          </TouchableOpacity>
                        ))
                      )}
                    </ScrollView>
                    <TouchableOpacity
                      style={styles.addCatBtn}
                      onPress={() => {
                        setEditTemplateId('');
                        setShowEditTemplatePicker(false);
                      }}
                    >
                      <Text style={styles.addCatBtnText}>+ Nama Custom</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {!editTemplateId && (
                  <TextInput
                    style={styles.input}
                    placeholder="Nama aplikasi custom"
                    value={editCustomName}
                    onChangeText={setEditCustomName}
                  />
                )}
              </>
            ) : null}

            <Text style={styles.label}>Notes</Text>
            <TextInput
              style={styles.input}
              placeholder="Ketentuan / Notes (opsional)"
              value={editNotes}
              onChangeText={setEditNotes}
              multiline
            />
            <TouchableOpacity
              style={styles.button}
              onPress={handleEditSubmit}
              disabled={updateApp.isPending}
            >
              <Text style={styles.buttonText}>
                {updateApp.isPending ? 'Menyimpan...' : 'Simpan'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => { setEditingApp(null); setEditNotes(''); setEditCategoryId(''); setEditTemplateId(''); setEditCustomName(''); }}>
              <Text style={styles.cancel}>Batal</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* Modal Tambah Aplikasi */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <View style={styles.modal}>
          <ScrollView style={styles.modalScroll} contentContainerStyle={styles.modalContent}>
            <Text style={styles.modalTitle}>Tambah Aplikasi</Text>

            {/* Kategori Selector */}
            <Text style={styles.label}>Kategori</Text>
            <TouchableOpacity
              style={styles.dropdown}
              onPress={() => { setShowCatPicker(!showCatPicker); setShowAddCategory(false); }}
            >
              <Text style={selectedCategory ? styles.dropdownText : styles.dropdownPlaceholder}>
                {selectedCategory
                  ? `${selectedCategory.icon ? selectedCategory.icon + ' ' : ''}${selectedCategory.name}`
                  : 'Pilih kategori...'}
              </Text>
              <Text style={styles.dropdownArrow}>{showCatPicker ? '^' : 'v'}</Text>
            </TouchableOpacity>

            {showCatPicker && (
              <View style={styles.dropdownContainer}>
                <ScrollView style={styles.dropdownList} nestedScrollEnabled>
                  {catsLoading ? (
                    <ActivityIndicator style={{ padding: 16 }} />
                  ) : (
                    <>
                      {categories?.map((cat) => (
                        <TouchableOpacity
                          key={cat.id}
                          style={[styles.dropdownItem, form.categoryId === cat.id && styles.dropdownItemSelected]}
                          onPress={() => {
                            setForm({ ...form, categoryId: cat.id, templateId: '' });
                            setCustomName('');
                            setShowCatPicker(false);
                          }}
                        >
                          <Text style={[styles.dropdownItemText, form.categoryId === cat.id && styles.dropdownItemTextSelected]}>
                            {cat.icon ? `${cat.icon} ` : ''}{cat.name}
                          </Text>
                          {cat.isDefault === false && (
                            <Text style={styles.customBadge}>Custom</Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </>
                  )}
                </ScrollView>

                {/* Tambah Kategori Baru */}
                {!showAddCategory ? (
                  <TouchableOpacity
                    style={styles.addCatBtn}
                    onPress={() => setShowAddCategory(true)}
                  >
                    <Text style={styles.addCatBtnText}>+ Tambah Kategori Baru</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.addCatForm}>
                    <View style={styles.addCatRow}>
                      <TextInput
                        style={styles.iconInput}
                        placeholder="icon"
                        value={newCatIcon}
                        onChangeText={setNewCatIcon}
                        maxLength={2}
                      />
                      <TextInput
                        style={styles.catNameInput}
                        placeholder="Nama kategori baru"
                        value={newCatName}
                        onChangeText={setNewCatName}
                      />
                    </View>
                    <View style={styles.addCatActions}>
                      <TouchableOpacity
                        style={styles.addCatSaveBtn}
                        onPress={handleAddCategory}
                        disabled={addCategory.isPending}
                      >
                        <Text style={styles.addCatSaveBtnText}>
                          {addCategory.isPending ? 'Menyimpan...' : 'Simpan'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setShowAddCategory(false); setNewCatName(''); setNewCatIcon(''); }}>
                        <Text style={styles.addCatCancelText}>Batal</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
              </View>
            )}

            {/* Template Selector (shown after category is selected) */}
            {form.categoryId ? (
              <>
                <Text style={styles.label}>Aplikasi</Text>
                <TouchableOpacity
                  style={styles.dropdown}
                  onPress={() => setShowTemplatePicker(!showTemplatePicker)}
                >
                  <Text style={selectedTemplate ? styles.dropdownText : styles.dropdownPlaceholder}>
                    {selectedTemplate ? selectedTemplate.name : 'Pilih aplikasi...'}
                  </Text>
                  <Text style={styles.dropdownArrow}>{showTemplatePicker ? '^' : 'v'}</Text>
                </TouchableOpacity>

                {showTemplatePicker && (
                  <View style={styles.dropdownContainer}>
                    <ScrollView style={styles.dropdownList} nestedScrollEnabled>
                      {templatesLoading ? (
                        <ActivityIndicator style={{ padding: 16 }} />
                      ) : (
                        <>
                          {templates?.map((tpl) => (
                            <TouchableOpacity
                              key={tpl.id}
                              style={[styles.dropdownItem, form.templateId === tpl.id && styles.dropdownItemSelected]}
                              onPress={() => {
                                setForm({ ...form, templateId: tpl.id });
                                setCustomName('');
                                setShowTemplatePicker(false);
                              }}
                            >
                              <Text style={[styles.dropdownItemText, form.templateId === tpl.id && styles.dropdownItemTextSelected]}>
                                {tpl.name}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </>
                      )}
                    </ScrollView>
                    <TouchableOpacity
                      style={styles.addCatBtn}
                      onPress={() => {
                        setForm({ ...form, templateId: '' });
                        setShowTemplatePicker(false);
                      }}
                    >
                      <Text style={styles.addCatBtnText}>+ Nama Custom</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* Custom name input (when no template selected) */}
                {!form.templateId && (
                  <TextInput
                    style={styles.input}
                    placeholder="Nama aplikasi custom"
                    value={customName}
                    onChangeText={setCustomName}
                  />
                )}
              </>
            ) : null}

            {/* Notes */}
            <TextInput
              style={styles.input}
              placeholder="Ketentuan / Notes (opsional)"
              value={form.notes}
              onChangeText={(v) => setForm({ ...form, notes: v })}
              multiline
            />

            <TouchableOpacity
              style={styles.button}
              onPress={handleSubmit}
              disabled={addApp.isPending}
            >
              <Text style={styles.buttonText}>
                {addApp.isPending ? 'Menyimpan...' : 'Simpan'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => {
              setShowAdd(false);
              setShowCatPicker(false);
              setShowAddCategory(false);
              setShowTemplatePicker(false);
              setForm({ categoryId: '', templateId: '', notes: '' });
              setCustomName('');
            }}>
              <Text style={styles.cancel}>Batal</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#f5f5f5' },
  addBtn: {
    backgroundColor: '#2563eb', borderRadius: 8, padding: 12, alignItems: 'center', marginBottom: 16,
  },
  addBtnText: { color: '#fff', fontWeight: '600' },
  card: {
    backgroundColor: '#fff', borderRadius: 8, padding: 16, marginBottom: 8, elevation: 1,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sectionHeader: { fontSize: 15, fontWeight: '600', color: '#333', marginTop: 12, marginBottom: 6, paddingHorizontal: 4 },
  cardInactive: { opacity: 0.5 },
  expiredBadge: { color: '#ef4444', fontSize: 12, fontWeight: '600', marginTop: 4 },
  warrantyBadge: { color: '#3b82f6', fontSize: 12, fontWeight: '600', marginTop: 4 },
  loginReportBadge: { color: '#f97316', fontSize: 12, fontWeight: '600', marginTop: 4 },
  cardTitle: { fontSize: 16, fontWeight: '600', flex: 1 },
  cardNotes: { fontSize: 12, color: '#666', marginTop: 4 },
  cardRow: { flexDirection: 'row', gap: 12, marginTop: 6 },
  cardMeta: { fontSize: 12, color: '#888', marginTop: 6 },
  cardStock: { fontSize: 11, color: '#666', marginTop: 2 },
  actionRow: { flexDirection: 'row', gap: 8 },
  actionBtn: { paddingHorizontal: 8, paddingVertical: 4 },
  editBtnText: { fontSize: 13, color: '#2563eb', fontWeight: '600' },
  deleteBtnText: { fontSize: 13, color: '#ef4444', fontWeight: '600' },
  empty: { textAlign: 'center', color: '#999', marginTop: 32 },
  modal: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center' },
  modalScroll: { maxHeight: '85%', margin: 16 },
  modalContent: { backgroundColor: '#fff', borderRadius: 12, padding: 24 },
  editModalContent: { margin: 24, backgroundColor: '#fff', borderRadius: 12, padding: 24 },
  switchRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 18, fontWeight: 'bold', marginBottom: 16 },
  label: { fontSize: 13, color: '#333', marginBottom: 4, fontWeight: '500', marginTop: 8 },
  // Dropdown
  dropdown: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12,
    marginBottom: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  dropdownText: { fontSize: 15, color: '#333' },
  dropdownPlaceholder: { fontSize: 15, color: '#999' },
  dropdownArrow: { fontSize: 12, color: '#999' },
  dropdownContainer: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8, marginBottom: 12, overflow: 'hidden',
  },
  dropdownList: { maxHeight: 180 },
  dropdownItem: {
    padding: 12, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  dropdownItemSelected: { backgroundColor: '#eff6ff' },
  dropdownItemText: { fontSize: 15, color: '#333' },
  dropdownItemTextSelected: { color: '#2563eb', fontWeight: '600' },
  customBadge: { fontSize: 10, color: '#8b5cf6', backgroundColor: '#f5f3ff', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  // Add Category
  addCatBtn: {
    padding: 12, alignItems: 'center', borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#fafafa',
  },
  addCatBtnText: { color: '#2563eb', fontWeight: '600', fontSize: 14 },
  addCatForm: { padding: 12, borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#fafafa' },
  addCatRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  iconInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, width: 48, textAlign: 'center', fontSize: 18,
  },
  catNameInput: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 10, flex: 1, fontSize: 14,
  },
  addCatActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  addCatSaveBtn: { backgroundColor: '#2563eb', borderRadius: 6, paddingHorizontal: 16, paddingVertical: 8 },
  addCatSaveBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  addCatCancelText: { color: '#666', fontSize: 13 },
  // Form
  input: {
    borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, marginBottom: 12,
  },
  button: {
    backgroundColor: '#2563eb', borderRadius: 8, padding: 14, alignItems: 'center',
  },
  buttonText: { color: '#fff', fontWeight: '600' },
  cancel: { textAlign: 'center', color: '#666', marginTop: 12 },
});
