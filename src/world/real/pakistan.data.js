// Simplified local terrain classification for the Islamabad training map.
// All cells are land; the surrounding heightfield and urban zones add the terrain detail.
export default {
  lat0: 33.72, lon0: 73.05, n: 33,
  fields: {
    ISB: { L: 3600, x: -18500, z: 17500, heading: 1.48, ref: '10/28' },
    RWP: { L: 2900, x: 4700, z: 11200, heading: 1.52, ref: '15/33' },
    TAX: { L: 2600, x: -7800, z: -13200, heading: 1.50, ref: '09/27' }
  },
  rle: 'hYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWFhYWF'
};
