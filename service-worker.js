// console.log("service-worker.js loaded")

let saved_token
const welcomePage = './calendar_highlights_sidepanel.html';
const mainPage = './calendar_highlights_sidepanel.html';

self.addEventListener('install', (event) => {
  // console.log('Service worker installing...');
});

// enables the clickable button
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch((error) => console.error(error));

self.addEventListener('activate', (event) => {
  // console.log('Service worker activating...');
});

chrome.runtime.onInstalled.addListener(() => {
  // console.log("on installed")
  chrome.sidePanel.setOptions({ path: welcomePage });
});

chrome.tabs.onActivated.addListener(async ({ tabId }) => {
  // console.log("tab activated")
  const { path } = await chrome.sidePanel.getOptions({ tabId });
  if (path === welcomePage) {
    chrome.sidePanel.setOptions({ path: mainPage });
  }
});

// Listen for messages 
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "validateToken") {
    validateToken(message.token).then(isValid => {
      sendResponse({ isValid: isValid });
    });
    return true;
  }
  if (message.action === "checkForAlert") {
    // console.log("user sign in message rec")
    checkForAlert();
  }
  if (message.action === "userSignIn") {
    // console.log("user sign in message rec")
    initiateOAuthFlow();
  }
  if (message.action === "userSignOut") {
    // console.log("user sign out message rec")
    userSignOut();
  }
  if (message.action === "fetchEvents") {
    chrome.storage.local.get(['token'], function(result) {
      // console.log("token result:", result)
      if (result.token) {
        fetchCalendarsAndEvents(result.token);
        const exclamationTorF = false
        updateIcon(exclamationTorF)
      } else {
          console.log("No access token available.");
          // Handle the case where there is no access token
      }
    });
  }
});

// Update Icon
function updateIcon(exclamationTorF) {
  if (exclamationTorF === false) {
    // console.log("remove exclamation")
    chrome.action.setIcon({
      path: {
        "16": "images/icon-16.png",
        "48": "images/icon-48.png",
        "128": "images/icon-128.png"
      }
    });
    const today = new Date();
    const todaysDate = today.getDate()
    // console.log("todaysDate:", todaysDate);
    // console.log("saved date not found, creating")
    chrome.storage.local.set({'lastDate': todaysDate })
    return;
  } else {
    // console.log("add exclamation")
    chrome.action.setIcon({
      path: {
        "16": "images/icon-16E.png",
        "48": "images/icon-48E.png",
        "128": "images/icon-128E.png"
      }
    });
  }
}

function checkToken() {
  chrome.identity.getAuthToken({ 'interactive': true }, function(token) {
    if (chrome.runtime.lastError) {
      console.error(chrome.runtime.lastError);
      // return;
    }

    fetch(`https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${token}`)
      .then(response => response.json())
      .then(info => {
          // console.log("info: ", info)
          // console.log("token info: ",token); 
      })
      .catch(error => {
          console.error('Error fetching token info:', error);
      });
  });
}

// check date last time opened, if more than a day ago show alert icon
// for simplicity, only using the day of the month, if the saved one is different from the current one, the alert is displayed
function checkForAlert() {
  const today = new Date();
  const todaysDate = today.getDate()
  // console.log("todaysDate:", todaysDate);
  // console.log("finding last checked date")
  chrome.storage.local.get(['lastDate'], function(result) {
    // console.log("date result", result)
    
    // if date was different, show alert
      if (result.lastDate) {
        // console.log("lastdate found, date different");
        if (result.lastDate != todaysDate) {
          // console.log("lastDate: ", result.lastDate);
          // console.log("saved last date:", result.lastDate);
          const exclamationTorF = true;
          updateIcon(exclamationTorF);
        } else {
          // console.log("date the same, alert not needed")
          const exclamationTorF = false
          updateIcon(exclamationTorF)
        }
      } else {
        console.log("lastdate not found");
        const exclamationTorF = true;
        updateIcon(exclamationTorF);
      }
    }
  )
}

function initiateOAuthFlow() {
  console.log("start auth")
  chrome.identity.getAuthToken({ 'interactive': true }, function(token) {
    console.log("token: ", token)
    chrome.storage.local.set({'token': token }, function() {
      if (chrome.runtime.lastError) {
        console.error('Error setting access_token:', chrome.runtime.lastError);
      } else {
        console.log('Access token saved successfully.');
        console.log("access token: ", token)
        fetchCalendarsAndEvents(token)
        const exclamationTorF = false
        updateIcon(exclamationTorF)
        }
      })
  })
}

async function fetchCalendarsAndEvents(token) {
  // Fetch calendars and process them
  let fetchedCalendars = await fetchCalendars(token);
  // console.log("fetchedCalendars:", fetchedCalendars)
  let todaysEvents = [];
  let tomorrowsEvents = [];
  let appointments = []
  for (const calendar of fetchedCalendars) {
    console.log("checking calendar:", calendar)
    let todaysEventsToAdd = await fetchTodaysEvents(token, calendar);
    let tomorrowsEventsToAdd = await fetchTomorrowsEvents(token, calendar);
    let appointmentsToAdd = await fetchAppointments(token, calendar);
    todaysEvents = todaysEvents.concat(todaysEventsToAdd);
    tomorrowsEvents = tomorrowsEvents.concat(tomorrowsEventsToAdd);
    appointments = appointments.concat(appointmentsToAdd);
  }
  console.log("todaysEvents:", todaysEvents)
  console.log("tomorrowsEvents:", tomorrowsEvents)
  console.log("appointments:", appointments)
  chrome.runtime.sendMessage({ action: 'updateTodayEvents', events: todaysEvents });
  chrome.runtime.sendMessage({ action: 'updateTomorrowEvents', events: tomorrowsEvents });
  chrome.runtime.sendMessage({ action: 'updateAppointments', events: appointments });
}

// gets primary calendar and anything with the word 'family'
async function fetchCalendars(token) {
  console.log("fetching calendars .. token:", token);
  let targetCalendars = [];

  const calendarApiEndpoint = 'https://www.googleapis.com/calendar/v3/users/me/calendarList';
  const headers = new Headers({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  });

  try {
    const response = await fetch(calendarApiEndpoint, { headers });
    if (!response.ok) {
      chrome.runtime.sendMessage({ action: 'errorMessage', events: 'unable to fetch calendars' });
      throw new Error('Failed to fetch calendars: ' + response.statusText);
    }

    const data = await response.json();
    const calendars = data.items;

    console.log('List of calendars:', calendars);

    // Fetch all calendars, filtering out non-primary/non-family only if needed
    calendars.forEach(calendar => {
      if (calendar.primary == true || calendar.summary.toLowerCase().includes('family') || (calendar.summary.toLowerCase().includes('primary'))) {
        // console.log(calendar.id, "is primary or family related");
        targetCalendars.push(calendar.id);
      }
    });

    // console.log("targetCalendars:", targetCalendars);
    return targetCalendars;

  } catch (error) {
    console.error('Error fetching calendars:', error);
    chrome.runtime.sendMessage({ action: 'errorMessage', events: 'unable to fetch calendars, try closing and reopening - thanks!' });

    return [];
  }
}

// fetch today's events:
async function fetchTodaysEvents(token, calendar) {
  // console.log("fetching todays events for calendar id:", calendar)
  if (calendar == undefined) {
    chrome.runtime.sendMessage({ action: 'errorMessage', events: 'calendar fetch error' });
    return [];
  }
  let now = new Date();
  let timezoneOffset = now.getTimezoneOffset() * 60000;
  let startDate = new Date(now.setHours(0, 0, 0, 0) - timezoneOffset);
  let endDate = new Date(startDate.getTime());
  endDate.setDate(startDate.getDate() + 1);
  endDate.setHours(23, 59, 59, 999);
  endDate = new Date(endDate.getTime() - timezoneOffset);

  let timeMin = startDate.toISOString();
  let timeMax = endDate.toISOString();
  const calendarApiEndpoint = `https://www.googleapis.com/calendar/v3/calendars/` + calendar + `/events`;

  const headers = new Headers({
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  });

  try {
    const response = await fetch(`${calendarApiEndpoint}?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`, { headers });
    const data = await response.json();
    // console.log("data:", data) // Logs as undefined
    // Create a Date object for the start of today (local time)
    let startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let todayDateString = startOfToday.toISOString().split('T')[0];
    // Filter out any events that don't match today's date
    let filteredEvents = data.items.filter(event => {
      let eventDate = event.start.dateTime ? event.start.dateTime.split('T')[0] : null;
      return eventDate === todayDateString;
    });
    // console.log("Filtered Today's events: ", filteredEvents);
    return filteredEvents; 
  } catch (error) {
    console.error('Error fetching today\'s events:', error);
    return [];
  }
}

// fetch tomorrow's events:
async function fetchTomorrowsEvents(token, calendar) {
  //console.log("will fetch tmw events");
  let now = new Date();
  let timezoneOffset = now.getTimezoneOffset() * 60000; // Offset in milliseconds
  // let startDate = new Date(now.setHours(0, 0, 0, 0) - timezoneOffset); // Adjust to UTC
  let startDate = new Date(now.setHours(0, 0, 0, 0)); // Adjust to UTC
  let endDate = new Date(startDate.getTime());
  startDate.setDate(startDate.getDate() + 1)
  endDate.setDate(startDate.getDate());
  endDate.setHours(23, 59, 59, 999); // Set to one millisecond before midnight
  // endDate = new Date(endDate.getTime() - timezoneOffset); // time zone correction required for .toISOString() later
  endDate = new Date(endDate.getTime());
  // console.log("tmw start: ", startDate, "tmw end: ", endDate)
  let timeMin = startDate.toISOString();
  let timeMax = endDate.toISOString();
  // console.log("Tmw search range: timeMin:", timeMin, "timeMax:", timeMax);
  const calendarApiEndpoint = `https://www.googleapis.com/calendar/v3/calendars/` + calendar + `/events`;
  const headers = new Headers({
    'Authorization' : `Bearer ${token}`,
    'Content-Type': 'application/json'
  })
  try {
    const response = await fetch(`${calendarApiEndpoint}?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`, { headers });
    const data = await response.json();
    return data.items;
  } catch(error) {
    console.error('Error fetching calendar events:', error);
    throw error; // Re-throw the caught error
  };
}

// fetch appointments:
async function fetchAppointments(token, calendar) {
  //console.log("will fetch appointments");
  let now = new Date();
  let timezoneOffset = now.getTimezoneOffset() * 60000; // Offset in milliseconds
  let startDate = new Date(now.setHours(0, 0, 0, 0) - timezoneOffset); // Adjust to UTC
  let endDate = new Date(startDate.getTime());
  endDate.setDate(endDate.getDate() + 30); // look ahead one month
  endDate.setHours(23, 59, 59, 999); // Set to one millisecond before midnight
  endDate = new Date(endDate.getTime() - timezoneOffset); // time zone correction required for .toISOString() later
  // console.log("Appt search start time (UTC): ", startDate.toISOString());
  // console.log("Appt search end time (UTC): ", endDate.toISOString());
  let timeMin = startDate.toISOString();
  let timeMax = endDate.toISOString();
  // console.log("Appointment search range: timeMin:", timeMin, "timeMax:", timeMax);
  const calendarApiEndpoint = `https://www.googleapis.com/calendar/v3/calendars/` + calendar + `/events`;
  const headers = new Headers({
    'Authorization' : 'Bearer ' + token,
    'Content-Type': 'application/json'
  })
  
  try {
    const response = await fetch(`${calendarApiEndpoint}?timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&singleEvents=true&orderBy=startTime`, { headers });
    
    const data = await response.json();
    if (!Array.isArray(data.items)) {
      console.log("Calandar events error - should be array")
    }
    for (let i = data.items.length - 1; i >= 0; i--) {
      if (!data.items[i].summary) {
        data.items.splice(i, 1);
      }
    }
    data.items = data.items.filter(item => /doctor|dr|appt|appointment|birthday|bday/i.test(item.summary));
    // console.log("Filtered appointments: ", data.items);
    return data.items
  } catch (error) {
    console.error('Error fetching calendar events:', error);
    throw error; // Re-throw the caught error
  };
}

// Validate the token
async function validateToken(accessToken) {
  // console.log("accesstoken:", accessToken)
    try {
      const response = await fetch('https://www.googleapis.com/oauth2/v1/tokeninfo?access_token=' + accessToken);
      return response.status === 200;
    } catch (error) {
      console.error('Error validating token:', error);
      return false;
    }
}
  
async function exchangeAuthorizationCodeForToken(code) {
  console.log("exchange code for token now");
  const tokenEndpoint = 'https://oauth2.googleapis.com/token';
  const data = new URLSearchParams({
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code: code,
      grant_type: 'authorization_code',
      redirect_uri: chrome.identity.getRedirectURL()
  });

  try {
      const response = await fetch(tokenEndpoint, {
          method: 'POST',
          headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: data
      });

      const tokens = await response.json();
      // console.log("save token now");

      // Save the tokens in chrome.storage.local
      chrome.storage.local.set({ 'token': tokens.access_token }, async function () {
          if (chrome.runtime.lastError) {
              console.error('Error setting access_token:', chrome.runtime.lastError);
          } else {
              console.log('Access token saved successfully.');
              // console.log("access token: ", tokens.access_token);
          }
      });

      // Save the refresh token if present
      if (tokens.refresh_token) {
          chrome.storage.local.set({ 'refresh_token': tokens.refresh_token }, function () {
              if (chrome.runtime.lastError) {
                  console.error('Error setting refresh_token:', chrome.runtime.lastError);
              } else {
                  console.log('Refresh token saved successfully.');
              }
          });
      }

  } catch (error) {
      console.error('Error exchanging authorization code for token:', error);
  }
}

function userSignOut() {
  chrome.storage.local.get(['token'], function(items) {
      var token = items.token;
      if (token) {
          fetch('https://oauth2.googleapis.com/revoke?token=' + token, {
              method: 'POST'
          })
          .then(response => {
              if(response.ok) {
                  console.log('Token revoked successfully');
                  // Clear the tokens from storage after revocation
                  chrome.storage.local.remove(['token', 'refresh_token'], function() {
                      console.log('Tokens removed successfully.');
                      chrome.runtime.sendMessage({ action: 'errorMessage', events: 'You are signed out.' });
                  });
              } else {
                  console.log('Failed to revoke token');
              }
          })
          .catch(error => console.error('Error revoking token:', error));
      }
  });

  // let emptyEvents = [];
  // chrome.runtime.sendMessage({ action: 'clearEvents' });
}

function isBrave() {
  return new Promise((resolve) => {
    const isBrave = false;
    if (navigator.brave) {
      navigator.brave.isBrave().then((result) => resolve(result));
    } else {
      // Perform additional checks
      resolve(isBrave);
    }
  });
}

async function getBrowserName() {
  const userAgent = navigator.userAgent.toLowerCase();
  // console.log("navigator:", navigator)

  if (await isBrave()) {
    return 'Brave';
  } else if (userAgent.includes('chrome')) {
    return 'Chrome';
  } else {
    return 'Other';
  }
}

getBrowserName().then(browserName => {
  // console.log(`Browser detected: ${browserName}`);

  if (browserName === 'Brave') {
    // Specific logic for Brave
    // console.log('Running Brave-specific code');
  } else if (browserName === 'Chrome') {
    // Specific logic for Chrome
    // console.log('Running Chrome-specific code');
  } else {
    // Logic for other browsers
    // console.log('Running code for other browsers');
  }
});


checkForAlert()