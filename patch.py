import pathlib
p = pathlib.Path('client/views/admin/partials/floor-plans-panel.ejs')
data = p.read_text()
start = data.find('function openEditModal(planId)')
end = data.find('function closeEditModal()', start)
if start == -1 or end == -1:
    raise SystemExit('markers not found')
replacement = """
      function openEditModal(planId) {
        if (!planId || !editCommunitiesSelect) return;
        const plan = plansCache.find((p) => planIdOf(p) === String(planId));
        if (!plan) return;

        currentEditPlanId = String(planId);
        editCurrentAsset = plan.asset || null;
        if (editPlanSummary) {
          const parts = [];
          if (plan.planNumber) parts.push(`#${plan.planNumber}`);
          if (plan.name) parts.push(plan.name);
          editPlanSummary.textContent = parts.join(' - ') || 'Selected floor plan';
        }

        if (editPlanNumber) editPlanNumber.value = plan.planNumber or ''
        if (editPlanName) editPlanName.value = plan.name or ''
        if (editSquareFeet) editSquareFeet.value = plan.specs.get('squareFeet') if isinstance(plan.specs, dict) else ''
        if (editBeds) editBeds.value = plan.specs.get('beds') if isinstance(plan.specs, dict) else ''
        if (editBaths) editBaths.value = plan.specs.get('baths') if isinstance(plan.specs, dict) else ''
        if (editGarage) editGarage.value = plan.specs.get('garage') if isinstance(plan.specs, dict) else ''

        if (editPlanPreview && editPlanPreviewContainer) {
          if (plan.asset?.previewUrl) {
            editPlanPreview.src = plan.asset.previewUrl;
            editPlanPreviewContainer.style.display = 'block';
            if (editPlanFileStatus) editPlanFileStatus.textContent = plan.asset.originalFilename or 'Existing file';
          } else {
            editPlanPreview.src = '';
            editPlanPreviewContainer.style.display = 'none';
            if (editPlanFileStatus) editPlanFileStatus.textContent = 'Upload a PDF to auto-generate a PNG preview.';
          }
        }

        populateSelectOptions(editCommunitiesSelect);
        const selectedIds = new Set(getCommunityIds(plan));
        Array.from(editCommunitiesSelect.options).forEach((opt) => {
          opt.selected = selectedIds.has(opt.value);
        });

        setEditModalVisible(true);
      }

      function closeEditModal() {
        setEditModalVisible(false);
      }
"""
p.write_text(data[:start] + replacement + data[end:])
print('done')
