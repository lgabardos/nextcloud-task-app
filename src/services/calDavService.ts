import { NextcloudCredentials } from './authService';

export interface TaskList {
  id: string;
  url: string;
  displayName: string;
  color?: string;
  description?: string;
  taskCount?: number;
}

export interface Task {
  id: string;
  url: string;
  uid: string;
  summary: string;
  description?: string;
  status: 'NEEDS-ACTION' | 'IN-PROCESS' | 'COMPLETED' | 'CANCELLED';
  priority?: number; // 1-9, 1=highest
  percentComplete?: number;
  due?: string;
  created?: string;
  lastModified?: string;
  categories?: string[];
  calendarUrl: string;
}

function getBasicAuth(creds: NextcloudCredentials): string {
  return 'Basic ' + btoa(`${creds.loginName}:${creds.appPassword}`);
}

function getCalDavBase(creds: NextcloudCredentials): string {
  return `${creds.serverUrl}/remote.php/dav`;
}

/**
 * Parse XML response (simple regex-based parser, no deps needed)
 */
function extractXmlValue(xml: string, tag: string): string | undefined {
  const regex = new RegExp(`<(?:[^:]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[^:]+:)?${tag}>`, 'i');
  const match = xml.match(regex);
  return match ? match[1].trim() : undefined;
}

function extractAllXmlValues(xml: string, tag: string): string[] {
  const regex = new RegExp(`<(?:[^:]+:)?${tag}[^>]*>([\\s\\S]*?)<\\/(?:[^:]+:)?${tag}>`, 'gi');
  const results: string[] = [];
  let match;
  while ((match = regex.exec(xml)) !== null) {
    results.push(match[1].trim());
  }
  return results;
}

/**
 * Split a PROPFIND response into individual <response> blocks
 */
function splitResponses(xml: string): string[] {
  const responses: string[] = [];
  const regex = /<(?:d:|D:)?response[\s>][\s\S]*?<\/(?:d:|D:)?response>/gi;
  let match;
  while ((match = regex.exec(xml)) !== null) {
    responses.push(match[0]);
  }
  return responses;
}

/**
 * Fetch all task lists (calendars with VTODO component) for the user
 */
export async function fetchTaskLists(creds: NextcloudCredentials): Promise<TaskList[]> {
  const url = `${getCalDavBase(creds)}/calendars/${creds.loginName}/`;

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<d:propfind xmlns:d="DAV:" xmlns:cs="http://calendarserver.org/ns/" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:nc="http://nextcloud.com/ns">
  <d:prop>
    <d:displayname/>
    <d:resourcetype/>
    <cs:getctag/>
    <c:supported-calendar-component-set/>
    <nc:calendar-color/>
    <d:current-user-privilege-set/>
  </d:prop>
</d:propfind>`;

  const response = await fetch(url, {
    method: 'PROPFIND',
    headers: {
      Authorization: getBasicAuth(creds),
      Depth: '1',
      'Content-Type': 'application/xml; charset=utf-8',
    },
    body,
  });

  if (!response.status.toString().startsWith('2') && response.status !== 207) {
    throw new Error(`Erreur CalDAV: ${response.status}`);
  }

  const xml = await response.text();
  const responses = splitResponses(xml);
  const lists: TaskList[] = [];

  for (const resp of responses) {
    // Check if it supports VTODO
    const hasTodo = resp.toLowerCase().includes('vtodo');
    if (!hasTodo) continue;

    // Extract href
    const hrefMatch = resp.match(/<(?:d:|D:)?href[^>]*>([\s\S]*?)<\/(?:d:|D:)?href>/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1].trim();

    // Skip the principal resource (root calendar collection)
    if (href.endsWith(`/calendars/${creds.loginName}/`)) continue;

    const displayName = extractXmlValue(resp, 'displayname') || href.split('/').filter(Boolean).pop() || 'Sans nom';
    const colorRaw = extractXmlValue(resp, 'calendar-color');
    const color = colorRaw ? colorRaw.substring(0, 7) : undefined; // strip alpha

    const id = href.split('/').filter(Boolean).pop() || href;

    lists.push({
      id,
      url: `${creds.serverUrl}${href}`,
      displayName,
      color,
    });
  }

  return lists;
}

/**
 * Fetch all tasks (VTODO) from a specific task list
 */
export async function fetchTasks(
  creds: NextcloudCredentials,
  listUrl: string
): Promise<Task[]> {
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<c:calendar-query xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav">
  <d:prop>
    <d:getetag/>
    <c:calendar-data/>
  </d:prop>
  <c:filter>
    <c:comp-filter name="VCALENDAR">
      <c:comp-filter name="VTODO"/>
    </c:comp-filter>
  </c:filter>
</c:calendar-query>`;

  const response = await fetch(listUrl, {
    method: 'REPORT',
    headers: {
      Authorization: getBasicAuth(creds),
      Depth: '1',
      'Content-Type': 'application/xml; charset=utf-8',
    },
    body,
  });

  if (response.status !== 207 && !response.status.toString().startsWith('2')) {
    throw new Error(`Erreur récupération tâches: ${response.status}`);
  }

  const xml = await response.text();
  const responses = splitResponses(xml);
  const tasks: Task[] = [];

  for (const resp of responses) {
    const calData = extractXmlValue(resp, 'calendar-data');
    if (!calData) continue;

    const hrefMatch = resp.match(/<(?:d:|D:)?href[^>]*>([\s\S]*?)<\/(?:d:|D:)?href>/i);
    if (!hrefMatch) continue;
    const href = hrefMatch[1].trim();

    const task = parseVTodo(calData, `${creds.serverUrl}${href}`, listUrl);
    if (task) tasks.push(task);
  }

  return tasks;
}

/**
 * Parse iCalendar VTODO component into a Task object
 */
function parseVTodo(ical: string, url: string, calendarUrl: string): Task | null {
  // Extract VTODO block
  const todoMatch = ical.match(/BEGIN:VTODO([\s\S]*?)END:VTODO/i);
  if (!todoMatch) return null;
  const todo = todoMatch[1];

  const getField = (name: string): string | undefined => {
    // Handle folded lines (lines starting with space/tab are continuations)
    const unfolded = todo.replace(/\r?\n[ \t]/g, '');
    const regex = new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, 'mi');
    const match = unfolded.match(regex);
    return match ? match[1].trim() : undefined;
  };

  const uid = getField('UID');
  const summary = getField('SUMMARY') || 'Sans titre';
  const statusRaw = getField('STATUS') || 'NEEDS-ACTION';
  const status = ['NEEDS-ACTION', 'IN-PROCESS', 'COMPLETED', 'CANCELLED'].includes(statusRaw)
    ? (statusRaw as Task['status'])
    : 'NEEDS-ACTION';

  const priorityRaw = getField('PRIORITY');
  const priority = priorityRaw ? parseInt(priorityRaw, 10) : undefined;

  const percentRaw = getField('PERCENT-COMPLETE');
  const percentComplete = percentRaw ? parseInt(percentRaw, 10) : undefined;

  const description = getField('DESCRIPTION');
  const due = getField('DUE');
  const created = getField('CREATED');
  const lastModified = getField('LAST-MODIFIED');

  const categoriesRaw = getField('CATEGORIES');
  const categories = categoriesRaw ? categoriesRaw.split(',').map((c) => c.trim()) : undefined;

  return {
    id: url.split('/').pop() || url,
    url,
    uid: uid || url,
    summary,
    description,
    status,
    priority,
    percentComplete,
    due,
    created,
    lastModified,
    categories,
    calendarUrl,
  };
}

/**
 * Create a new task in a task list
 */
export async function createTask(
  creds: NextcloudCredentials,
  listUrl: string,
  task: {
    summary: string;
    description?: string;
    priority?: number;
    due?: string;
  }
): Promise<void> {
  const uid = `${Date.now()}-${Math.random().toString(36).substring(2)}`;
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  const ical = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//NextcloudTasks//EN',
    'BEGIN:VTODO',
    `UID:${uid}`,
    `CREATED:${now}`,
    `LAST-MODIFIED:${now}`,
    `SUMMARY:${task.summary}`,
    task.description ? `DESCRIPTION:${task.description}` : null,
    task.priority ? `PRIORITY:${task.priority}` : null,
    task.due ? `DUE;VALUE=DATE:${task.due.replace(/-/g, '')}` : null,
    'STATUS:NEEDS-ACTION',
    'END:VTODO',
    'END:VCALENDAR',
  ]
    .filter(Boolean)
    .join('\r\n');

  const taskUrl = `${listUrl.replace(/\/$/, '')}/${uid}.ics`;

  const response = await fetch(taskUrl, {
    method: 'PUT',
    headers: {
      Authorization: getBasicAuth(creds),
      'Content-Type': 'text/calendar; charset=utf-8',
    },
    body: ical,
  });

  if (!response.ok && response.status !== 201 && response.status !== 204) {
    throw new Error(`Erreur création tâche: ${response.status}`);
  }
}

/**
 * Update task status (toggle complete)
 */
export async function updateTaskStatus(
  creds: NextcloudCredentials,
  task: Task,
  completed: boolean
): Promise<void> {
  const getResponse = await fetch(task.url, {
    method: 'GET',
    headers: {
      Authorization: getBasicAuth(creds),
    },
  });

  if (!getResponse.ok) throw new Error(`Erreur récupération: ${getResponse.status}`);

  let ical = await getResponse.text();
  const now = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';

  // Update STATUS
  ical = ical.replace(/^STATUS:.*$/m, `STATUS:${completed ? 'COMPLETED' : 'NEEDS-ACTION'}`);

  // Update PERCENT-COMPLETE
  if (ical.match(/^PERCENT-COMPLETE:/m)) {
    ical = ical.replace(/^PERCENT-COMPLETE:.*$/m, `PERCENT-COMPLETE:${completed ? 100 : 0}`);
  } else {
    ical = ical.replace(/^END:VTODO/m, `PERCENT-COMPLETE:${completed ? 100 : 0}\r\nEND:VTODO`);
  }

  // Add COMPLETED timestamp if needed
  if (completed) {
    if (ical.match(/^COMPLETED:/m)) {
      ical = ical.replace(/^COMPLETED:.*$/m, `COMPLETED:${now}`);
    } else {
      ical = ical.replace(/^END:VTODO/m, `COMPLETED:${now}\r\nEND:VTODO`);
    }
  } else {
    ical = ical.replace(/^COMPLETED:.*\r?\n/m, '');
  }

  // Update LAST-MODIFIED
  ical = ical.replace(/^LAST-MODIFIED:.*$/m, `LAST-MODIFIED:${now}`);

  const putResponse = await fetch(task.url, {
    method: 'PUT',
    headers: {
      Authorization: getBasicAuth(creds),
      'Content-Type': 'text/calendar; charset=utf-8',
    },
    body: ical,
  });

  if (!putResponse.ok && putResponse.status !== 201 && putResponse.status !== 204) {
    throw new Error(`Erreur mise à jour: ${putResponse.status}`);
  }
}

/**
 * Delete a task
 */
export async function deleteTask(
  creds: NextcloudCredentials,
  taskUrl: string
): Promise<void> {
  const response = await fetch(taskUrl, {
    method: 'DELETE',
    headers: {
      Authorization: getBasicAuth(creds),
    },
  });

  if (!response.ok && response.status !== 204) {
    throw new Error(`Erreur suppression: ${response.status}`);
  }
}

/**
 * Get priority label and color
 */
export function getPriorityInfo(priority?: number): { label: string; color: string } {
  if (!priority || priority === 0) return { label: 'Aucune', color: '#3D5068' };
  if (priority <= 3) return { label: 'Haute', color: '#EF4444' };
  if (priority <= 6) return { label: 'Moyenne', color: '#F59E0B' };
  return { label: 'Basse', color: '#22C55E' };
}

/**
 * Format a CalDAV date string to readable format
 */
export function formatDueDate(dateStr?: string): string | undefined {
  if (!dateStr) return undefined;
  // DATE format: YYYYMMDD or YYYYMMDDTHHMMSSZ
  const clean = dateStr.replace(/[TZ]/g, '').replace(/;.*$/, '');
  const year = clean.substring(0, 4);
  const month = clean.substring(4, 6);
  const day = clean.substring(6, 8);
  return `${day}/${month}/${year}`;
}

/**
 * Create a new task list (calendar) via CalDAV MKCALENDAR
 */
export async function createTaskList(
  creds: NextcloudCredentials,
  name: string,
  color?: string
): Promise<TaskList> {
  const slug = name
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    || `list-${Date.now()}`;

  const calUrl = `${creds.serverUrl}/remote.php/dav/calendars/${creds.loginName}/${slug}/`;

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<c:mkcalendar xmlns:d="DAV:" xmlns:c="urn:ietf:params:xml:ns:caldav" xmlns:nc="http://nextcloud.com/ns" xmlns:oc="http://owncloud.org/ns">
  <d:set>
    <d:prop>
      <d:displayname>${name}</d:displayname>
      <c:supported-calendar-component-set>
        <c:comp name="VTODO"/>
      </c:supported-calendar-component-set>
      ${color ? `<nc:calendar-color>${color}FF</nc:calendar-color>` : ''}
    </d:prop>
  </d:set>
</c:mkcalendar>`;

  const response = await fetch(calUrl, {
    method: 'MKCALENDAR',
    headers: {
      Authorization: 'Basic ' + btoa(`${creds.loginName}:${creds.appPassword}`),
      'Content-Type': 'application/xml; charset=utf-8',
    },
    body,
  });

  // 201 Created or 405 already exists
  if (response.status !== 201 && response.status !== 200) {
    if (response.status === 405) {
      throw new Error(`Une liste nommée "${name}" existe déjà.`);
    }
    throw new Error(`Erreur création liste: ${response.status}`);
  }

  return {
    id: slug,
    url: calUrl,
    displayName: name,
    color: color ?? undefined,
  };
}

/**
 * Delete a task list (calendar)
 */
export async function deleteTaskList(
  creds: NextcloudCredentials,
  listUrl: string
): Promise<void> {
  const response = await fetch(listUrl, {
    method: 'DELETE',
    headers: {
      Authorization: 'Basic ' + btoa(`${creds.loginName}:${creds.appPassword}`),
    },
  });

  if (!response.ok && response.status !== 204) {
    throw new Error(`Erreur suppression liste: ${response.status}`);
  }
}
