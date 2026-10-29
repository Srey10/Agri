// Display helpers for the logged-in farmer. Everything comes from user.profile,
// which the backend loads from the farmer_profile table.

export function getFarmInfo(user) {
  const p = user?.profile
  const location = [p?.district, p?.state].filter(Boolean).join(', ')
  return {
    hasProfile: !!p,
    farmName: p?.farmName || (user?.name ? `${user.name}'s Farm` : 'My Farm'),
    location,
    fieldId: p?.fieldId || '',
    crop: p?.primaryCrop || '',
  }
}
