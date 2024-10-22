
/* 
When the side panel opens check for token, if token not there request authorization, otherwise display
info screen
*/

document.addEventListener('DOMContentLoaded', function() {
    checkAuthentication();
});

document.getElementById('okButton').addEventListener('click', function() {
  // console.log("disclosure ok button clicked")
  // Show authorize button
  document.getElementById('disclosure').style.display = 'none';
  document.getElementById('disclosure2').style.display = 'none';
  document.getElementById('authButtonContainer').style.display = 'block';
  document.getElementById('authorize_button').style.display = 'block';
  document.getElementById('today').style.display = 'block';
  document.getElementById('tomorrow').style.display = 'block';
  document.getElementById('appointments').style.display = 'block';
  chrome.runtime.sendMessage({ action: "userSignIn" });
});

document.getElementById('authorize_button').addEventListener('click', function() {
    // console.log("authorize button clicked")
    // Start the authentication process
    chrome.runtime.sendMessage({ action: "userSignIn" });
});

document.getElementById('goto_calendar').addEventListener('click', function() {
    // console.log("go to calendar clicked")
    window.open("https://calendar.google.com/calendar/u/0/r/week", "_blank");
});

document.getElementById('signout_button').addEventListener('click', function() {
  // console.log("sign out calendar clicked")
  clearAllEvents()
  chrome.runtime.sendMessage({ action: "userSignOut" });
});

chrome.runtime.onMessage.addListener((message, events, sender, sendResponse) => {
  console.log("message:", message.action, message.events)
  if (message.action === 'errorMessage'){
    let errorMessageToAdd = message.events;
    
    errorMessage(errorMessageToAdd);
  }
  if (message.action === 'error401') {
    let message = "Google Sign in error :( Try to reopen the extension. This extension only works on Chrome at the moment.";
    errorMessage(message);
  }
  if (message.action === 'updateTodayEvents') {
    // console.log("Today message.events: ", message.events)
    updateToday(message.events);
    document.getElementById('authButtonContainer').style.display = 'none';
    document.getElementById('authorize_button').style.display = 'none';
    document.getElementById('today').style.display = 'block';
    document.getElementById('goto_calendar').style.display = 'block';
    document.getElementById('signout_button').style.display = 'block';
    document.getElementById('signout_info').style.display = 'block';
    document.getElementById('errorMessages').style.display = 'none';
  }
  if (message.action === 'updateTomorrowEvents') {
    // console.log("Tomorrow message.events: ", message.events)
    updateTomorrow(message.events);
    document.getElementById('authButtonContainer').style.display = 'none';
    document.getElementById('authorize_button').style.display = 'none';
    document.getElementById('tomorrow').style.display = 'block';
    document.getElementById('goto_calendar').style.display = 'block';
    document.getElementById('signout_button').style.display = 'block';
    document.getElementById('signout_info').style.display = 'block';
    document.getElementById('errorMessages').style.display = 'none';
    }
  if (message.action === 'updateAppointments') {
    // console.log("Appointments message.events: ", message.events)
    updateAppointments(message.events);
    document.getElementById('authButtonContainer').style.display = 'none';
    document.getElementById('authorize_button').style.display = 'none';
    document.getElementById('appointments').style.display = 'block';
    document.getElementById('goto_calendar').style.display = 'block';
    document.getElementById('signout_button').style.display = 'block';
    document.getElementById('signout_info').style.display = 'block';
    document.getElementById('errorMessages').style.display = 'none';
  }
  // if (message === 'clearEvents') {
  //   clearAllEvents()
  // }
});

function clearAllEvents() {
  eventsContainer.innerHTML = ''
  // console.log("events should be cleared now")
}

function checkIcon() {
  // console.log("check icon")
  chrome.runtime.sendMessage({ action: "checkForAlert" });
}

function checkAuthentication() {
  // console.log("checking authentication now")
  chrome.storage.local.get(['token'], function(result) {
    // console.log("token result: ", result)
      if (result.token) {
      // Ask the service worker to validate the token
        chrome.runtime.sendMessage({ action: "validateToken", token: result.token }, function(response) {
          if (response.isValid) {
            // console.log("token is valid, proceed to fetch calendar events")
            chrome.runtime.sendMessage({ action: "fetchEvents" });
            document.getElementById('disclosure').style.display = 'none';
            document.getElementById('disclosure2').style.display = 'none';
            document.getElementById('authButtonContainer').style.display = 'none';
            document.getElementById('authorize_button').style.display = 'none';
            document.getElementById('errorMessages').style.display = 'none';
          } else {
            // console.log("Token is not valid, show the Disclosure screen")
            document.getElementById('disclosure').style.display = 'block';
            document.getElementById('disclosure2').style.display = 'block';
            document.getElementById('errorMessages').style.display = 'none';
            // Fetch the token from storage first
            chrome.storage.local.get(['token'], function(items) {
              var oldToken = items.token; // Retrieve the stored token
              if (oldToken) {
                  // Remove the cached token using the retrieved value
                  chrome.identity.removeCachedAuthToken({ 'token': oldToken }, function() {
                      // console.log('Cached token removed successfully.');
                      // After successfully removing the cached token, clear it from local storage
                      chrome.storage.local.remove(['token', 'refresh_token'], function() {
                          // console.log('Tokens removed successfully from local storage.');
                      });
                  });
              } else {
                  // console.log('No token found or already removed.');
              }
            });
            }
        });
      } else {
      // No token found, show the Disclosure Screen
        // console.log("Token not found, show the Disclosure screen")
        document.getElementById('disclosure').style.display = 'block';
        document.getElementById('disclosure2').style.display = 'block';
        document.getElementById('errorMessages').style.display = 'none';
      }
  });
}

function makeEyeReadableTimeOnly(dt) {
    const eventDate = new Date(dt);
    const options = { hour: '2-digit', minute: '2-digit', hour12: true };
    const readableDateTime = new Intl.DateTimeFormat('en-US', options).format(eventDate);
    return readableDateTime;
}

function makeEyeReadableDateTime(dt) {
    const eventDate = new Date(dt);
    const options = { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true };
    const readableDateTime = new Intl.DateTimeFormat('en-US', options).format(eventDate);
    return readableDateTime; // Example output: "December 31, 2024, 09:00 PM"
}

function makeEyeReadableDateOnly(dt) {
    const eventDate = new Date(dt + 'T00:00:00'); // necessary for time zone issue
    // console.log("input date: ", dt)
    const options = { month: 'long', day: 'numeric' };
    const readableDate = new Intl.DateTimeFormat('en-US', options).format(eventDate);
    // console.log("readableDate", readableDate)
    return readableDate; 
}

function updateToday(events) {
    const eventsContainer = document.getElementById('eventsToday');
    eventsContainer.innerHTML = '';
    if (events.length < 1) {
      console.log("no events, returning")
      return
    }
    events.forEach(event => {
      let eventWrapper = document.createElement('div'); // Wrapper for each event
      eventWrapper.classList.add('event-wrapper'); // Add class for styling
  
      let eventElement = document.createElement('div');
      eventElement.classList.add('event-content'); // Add class for styling
      
      if (!event.start.dateTime) {
        eventElement.textContent = makeEyeReadableDateOnly(event.start.date) + ": " + event.summary;
      } else {
        eventElement.textContent = event.summary + " " + makeEyeReadableDateTime(event.start.dateTime) + " till " + makeEyeReadableTimeOnly(event.end.dateTime);
      }
      
      eventWrapper.appendChild(eventElement); 
      eventsContainer.appendChild(eventWrapper);
    });
}
  
function updateTomorrow(events) {
  const eventsContainer = document.getElementById('eventsTomorrow');
  eventsContainer.innerHTML = '';
  events.forEach(event => {
    if (events == null || events == '' || events == ' ' || events == undefined) {
      let message = "No calendar events to fetch"
      errorMessage(message)
    }
    let eventWrapper = document.createElement('div'); 
    eventWrapper.classList.add('event-wrapper');

    let eventElement = document.createElement('div');
    eventElement.classList.add('event-content'); 
    
    if (!event.start.dateTime) {
      eventElement.textContent = makeEyeReadableDateOnly(event.start.date) + ": " + event.summary;
    } else {
      eventElement.textContent = event.summary + " " + makeEyeReadableDateTime(event.start.dateTime) + " till " + makeEyeReadableTimeOnly(event.end.dateTime);
    }
    
    eventWrapper.appendChild(eventElement); // Append the event content to the wrapper
    eventsContainer.appendChild(eventWrapper); // Append the wrapper to the container
  });
}

function updateAppointments(events) {
    const eventsContainer = document.getElementById('eventsAppointments');
    eventsContainer.innerHTML = '';
    events.forEach(event => {
      let eventWrapper = document.createElement('div'); // Wrapper for each event
      eventWrapper.classList.add('event-wrapper'); // Add class for styling
  
      let eventElement = document.createElement('div');
      eventElement.classList.add('event-content'); // Add class for styling
      
      if (!event.start.dateTime) {
        eventElement.textContent = makeEyeReadableDateOnly(event.start.date) + ": " + event.summary;
      } else {
        eventElement.textContent = event.summary + " " + makeEyeReadableDateTime(event.start.dateTime) + " till " + makeEyeReadableTimeOnly(event.end.dateTime);
      }
      
      eventWrapper.appendChild(eventElement); // Append the event content to the wrapper
      eventsContainer.appendChild(eventWrapper); // Append the wrapper to the container
    });
}

function errorMessage(message) {
  document.getElementById('errorMessages').style.display = 'block';
  errorMessages.innerHTML = message
}

// Start the process to check if the user is already authenticated
// checkAuthentication();

checkIcon();