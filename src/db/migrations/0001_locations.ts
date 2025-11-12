// src/db/migrations/0001_locations.ts

export const migration = {
  name: '0001_locations',
  up(tx: any) {
    // Rooms (e.g., "Office", "Garage")
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS rooms (
        id INTEGER PRIMARY KEY NOT NULL,
        name TEXT NOT NULL UNIQUE
      );
    `);

    // Areas inside a Room (e.g., "Closet shelf", "Workbench")
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS areas (
        id INTEGER PRIMARY KEY NOT NULL,
        room_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        UNIQUE (room_id, name),
        FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
      );
    `);

    // Containers inside an Area (e.g., "Bin A3", "Drawer 2")
    tx.executeSql(`
      CREATE TABLE IF NOT EXISTS containers (
        id INTEGER PRIMARY KEY NOT NULL,
        area_id INTEGER NOT NULL,
        name TEXT NOT NULL,
        code TEXT, -- optional label like A3 or QR code
        UNIQUE (area_id, name),
        FOREIGN KEY (area_id) REFERENCES areas(id) ON DELETE CASCADE
      );
    `);
  },
};
