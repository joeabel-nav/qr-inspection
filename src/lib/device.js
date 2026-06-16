// ── Device & inspector identity helpers ───────────────────────
// Stores a device UUID and last-used employee number in localStorage.
// Not security — purely informational for flagging device changes.

const DEVICE_ID_KEY  = 'nv_insp_device_id'
const EMP_NUMBER_KEY = 'nv_insp_emp_number'

/**
 * Returns a stable device UUID for this browser.
 * Creates one on first call and persists it.
 */
export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(DEVICE_ID_KEY, id)
  }
  return id
}

/**
 * Returns the employee number last used on this device, or null.
 */
export function getStoredEmployeeNumber() {
  return localStorage.getItem(EMP_NUMBER_KEY)
}

/**
 * Stores the employee number used for this inspection.
 */
export function storeEmployeeNumber(empNumber) {
  localStorage.setItem(EMP_NUMBER_KEY, empNumber)
}

/**
 * Returns true if the entered number differs from the stored number.
 * Only flags when a stored number already exists.
 */
export function isDeviceFlagged(enteredNumber) {
  const stored = getStoredEmployeeNumber()
  if (!stored) return false
  return stored !== enteredNumber
}
