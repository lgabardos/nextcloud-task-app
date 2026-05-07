/**
 * Tests pour calDavService.ts
 *
 * On teste uniquement les fonctions pures (pas d'appels réseau) :
 * - getPriorityInfo
 * - formatDueDate
 * - parsing iCal interne (via fetchTasks mocké)
 * - construction du slug pour createTaskList
 */

import { getPriorityInfo, formatDueDate } from '../services/calDavService';

// ─── getPriorityInfo ─────────────────────────────────────────────────────────

describe('getPriorityInfo', () => {
  it('retourne "Aucune" pour priority undefined', () => {
    const result = getPriorityInfo(undefined);
    expect(result.label).toBe('Aucune');
    expect(result.color).toBe('#3D5068');
  });

  it('retourne "Aucune" pour priority = 0', () => {
    const result = getPriorityInfo(0);
    expect(result.label).toBe('Aucune');
  });

  it('retourne "Haute" pour priority = 1 (plus haute priorité)', () => {
    const result = getPriorityInfo(1);
    expect(result.label).toBe('Haute');
    expect(result.color).toBe('#EF4444');
  });

  it('retourne "Haute" pour priority = 3 (borne haute)', () => {
    expect(getPriorityInfo(3).label).toBe('Haute');
  });

  it('retourne "Moyenne" pour priority = 4', () => {
    expect(getPriorityInfo(4).label).toBe('Moyenne');
    expect(getPriorityInfo(4).color).toBe('#F59E0B');
  });

  it('retourne "Moyenne" pour priority = 6 (borne haute)', () => {
    expect(getPriorityInfo(6).label).toBe('Moyenne');
  });

  it('retourne "Basse" pour priority = 7', () => {
    expect(getPriorityInfo(7).label).toBe('Basse');
    expect(getPriorityInfo(7).color).toBe('#22C55E');
  });

  it('retourne "Basse" pour priority = 9 (plus basse priorité CalDAV)', () => {
    expect(getPriorityInfo(9).label).toBe('Basse');
  });
});

// ─── formatDueDate ───────────────────────────────────────────────────────────

describe('formatDueDate', () => {
  it('retourne undefined si dateStr est undefined', () => {
    expect(formatDueDate(undefined)).toBeUndefined();
  });

  it('formate une date au format YYYYMMDD', () => {
    expect(formatDueDate('20250115')).toBe('15/01/2025');
  });

  it('formate une date au format YYYYMMDDTHHMMSSZ (datetime)', () => {
    expect(formatDueDate('20250630T120000Z')).toBe('30/06/2025');
  });

  it('ignore les paramètres après ";" (ex: VALUE=DATE)', () => {
    expect(formatDueDate('20251231;VALUE=DATE')).toBe('31/12/2025');
  });

  it('gère correctement les mois et jours sur un seul chiffre', () => {
    expect(formatDueDate('20250101')).toBe('01/01/2025');
  });

  it('gère une année différente', () => {
    expect(formatDueDate('20301005')).toBe('05/10/2030');
  });
});

// ─── Fonctions réseau mockées ────────────────────────────────────────────────

describe('fetchTaskLists (mock réseau)', () => {
  const mockCreds = {
    serverUrl: 'https://cloud.example.com',
    loginName: 'alice',
    appPassword: 'secret',
  };

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('lève une erreur si le serveur répond 401', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      status: 401,
      text: async () => '',
    });

    const { fetchTaskLists } = require('../services/calDavService');
    await expect(fetchTaskLists(mockCreds)).rejects.toThrow('Erreur CalDAV: 401');
  });

  it('retourne un tableau vide si aucune réponse VTODO', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      status: 207,
      text: async () => `<?xml version="1.0"?>
        <d:multistatus xmlns:d="DAV:">
          <d:response>
            <d:href>/remote.php/dav/calendars/alice/</d:href>
            <d:propstat><d:prop><d:displayname>Calendriers</d:displayname></d:prop></d:propstat>
          </d:response>
        </d:multistatus>`,
    });

    const { fetchTaskLists } = require('../services/calDavService');
    const result = await fetchTaskLists(mockCreds);
    expect(result).toEqual([]);
  });

  it('parse correctement une liste VTODO', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      status: 207,
      text: async () => `<?xml version="1.0"?>
        <d:multistatus xmlns:d="DAV:" xmlns:nc="http://nextcloud.com/ns" xmlns:c="urn:ietf:params:xml:ns:caldav">
          <d:response>
            <d:href>/remote.php/dav/calendars/alice/work/</d:href>
            <d:propstat>
              <d:prop>
                <d:displayname>Travail</d:displayname>
                <c:supported-calendar-component-set>
                  <c:comp name="VTODO"/>
                </c:supported-calendar-component-set>
                <nc:calendar-color>#FF5733FF</nc:calendar-color>
              </d:prop>
            </d:propstat>
          </d:response>
        </d:multistatus>`,
    });

    const { fetchTaskLists } = require('../services/calDavService');
    const result = await fetchTaskLists(mockCreds);
    expect(result).toHaveLength(1);
    expect(result[0].displayName).toBe('Travail');
    expect(result[0].id).toBe('work');
    expect(result[0].color).toBe('#FF5733'); // alpha strippé
    expect(result[0].url).toBe('https://cloud.example.com/remote.php/dav/calendars/alice/work/');
  });
});

describe('fetchTasks (mock réseau)', () => {
  const mockCreds = {
    serverUrl: 'https://cloud.example.com',
    loginName: 'alice',
    appPassword: 'secret',
  };

  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('parse un VTODO complet correctement', async () => {
    const ical = `BEGIN:VCALENDAR
VERSION:2.0
BEGIN:VTODO
UID:abc-123
SUMMARY:Acheter du pain
STATUS:NEEDS-ACTION
PRIORITY:1
PERCENT-COMPLETE:0
DESCRIPTION:Boulangerie du coin
DUE;VALUE=DATE:20250720
CATEGORIES:courses,maison
CREATED:20250101T100000Z
LAST-MODIFIED:20250101T100000Z
END:VTODO
END:VCALENDAR`;

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      status: 207,
      text: async () => `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
        <d:response>
          <d:href>/remote.php/dav/calendars/alice/work/abc-123.ics</d:href>
          <d:propstat>
            <d:prop>
              <c:calendar-data>${ical}</c:calendar-data>
            </d:prop>
          </d:propstat>
        </d:response>
      </d:multistatus>`,
    });

    const { fetchTasks } = require('../services/calDavService');
    const tasks = await fetchTasks(mockCreds, 'https://cloud.example.com/remote.php/dav/calendars/alice/work/');

    expect(tasks).toHaveLength(1);
    const task = tasks[0];
    expect(task.uid).toBe('abc-123');
    expect(task.summary).toBe('Acheter du pain');
    expect(task.status).toBe('NEEDS-ACTION');
    expect(task.priority).toBe(1);
    expect(task.percentComplete).toBe(0);
    expect(task.description).toBe('Boulangerie du coin');
    expect(task.due).toBe('20250720');
    expect(task.categories).toEqual(['courses', 'maison']);
  });

  it('ignore les entrées sans VTODO', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      status: 207,
      text: async () => `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
        <d:response>
          <d:href>/remote.php/dav/calendars/alice/work/event.ics</d:href>
          <d:propstat>
            <d:prop>
              <c:calendar-data>BEGIN:VCALENDAR
BEGIN:VEVENT
SUMMARY:Réunion
END:VEVENT
END:VCALENDAR</c:calendar-data>
            </d:prop>
          </d:propstat>
        </d:response>
      </d:multistatus>`,
    });

    const { fetchTasks } = require('../services/calDavService');
    const tasks = await fetchTasks(mockCreds, 'https://cloud.example.com/remote.php/dav/calendars/alice/work/');
    expect(tasks).toHaveLength(0);
  });

  it('utilise "Sans titre" si SUMMARY absent', async () => {
    const ical = `BEGIN:VCALENDAR
BEGIN:VTODO
UID:no-title-123
STATUS:NEEDS-ACTION
END:VTODO
END:VCALENDAR`;

    (global.fetch as jest.Mock).mockResolvedValueOnce({
      status: 207,
      text: async () => `<d:multistatus xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
        <d:response>
          <d:href>/remote.php/dav/calendars/alice/work/no-title-123.ics</d:href>
          <d:propstat><d:prop><c:calendar-data>${ical}</c:calendar-data></d:prop></d:propstat>
        </d:response>
      </d:multistatus>`,
    });

    const { fetchTasks } = require('../services/calDavService');
    const tasks = await fetchTasks(mockCreds, 'https://cloud.example.com/remote.php/dav/calendars/alice/work/');
    expect(tasks[0].summary).toBe('Sans titre');
  });
});
