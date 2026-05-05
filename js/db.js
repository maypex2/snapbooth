const dbPromise = new Promise((resolve, reject) => {
  const req = indexedDB.open('SnapBoothDB', 1);
  req.onupgradeneeded = e => {
    e.target.result.createObjectStore('store');
  };
  req.onsuccess = e => resolve(e.target.result);
  req.onerror = () => reject('IDB Error');
});

async function saveShots(data) {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('store', 'readwrite');
    tx.objectStore('store').put(data, 'sb_shots');
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}

async function loadShotsData() {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('store', 'readonly');
    const req = tx.objectStore('store').get('sb_shots');
    req.onsuccess = () => resolve(req.result);
    req.onerror = reject;
  });
}

async function clearShotsData() {
  const db = await dbPromise;
  return new Promise((resolve, reject) => {
    const tx = db.transaction('store', 'readwrite');
    tx.objectStore('store').delete('sb_shots');
    tx.oncomplete = resolve;
    tx.onerror = reject;
  });
}
