import test from 'node:test';
import assert from 'node:assert/strict';
import { buildingFloors } from '../apps/web/src/game/buildingModel.ts';

test('new workspaces stack above older rooms without mutating server order', () => {
  const rooms = [
    { id: 'new', createdAt: '2026-02-01', updatedAt: '2026-02-01' },
    { id: 'old', createdAt: '2026-01-01', updatedAt: '2026-03-01' },
  ];
  assert.deepEqual(buildingFloors(rooms).map(({room,floor}) => [room.id,floor]), [['new',2],['old',1]]);
  assert.equal(rooms[0].id, 'new');
  rooms[1].updatedAt = '2027-01-01';
  assert.equal(buildingFloors(rooms)[0].room.id, 'new');
});
test('empty rooms and equal timestamps have deterministic floor numbers', () => {
  assert.deepEqual(buildingFloors([]), []);
  const rooms = ['b','a'].map(id => ({id,createdAt:'2026-01-01'}));
  assert.deepEqual(buildingFloors(rooms).map(({room,floor}) => [room.id,floor]), [['b',2],['a',1]]);
});
