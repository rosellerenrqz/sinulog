"use client";

import { useCallback, useState, useMemo, useRef, useEffect } from "react";
import {
  GoogleMap,
  useLoadScript,
  Marker,
  InfoWindow,
  DirectionsRenderer,
} from "@react-google-maps/api";
import schedule from "../../sinulog_schedule.json";

// Define TypeScript interfaces
interface Location {
  name: string;
  lat: number;
  lng: number;
}

interface Event {
  event: string;
  time: string;
  venue?: string;
  venues?: string[];
  note?: string;
}

// Cebu's center coordinates
const center = {
  lat: 10.3157,
  lng: 123.8854,
};

// Map locations with coordinates
const locations: { [key: string]: Location } = {
  "SM Seaside Cebu": { name: "SM Seaside Cebu", lat: 10.2751, lng: 123.86 },
  GMall: { name: "GMall", lat: 10.3127, lng: 123.8854 },
  "Basilica del Sto. Nino": {
    name: "Basilica del Sto. Nino",
    lat: 10.2947,
    lng: 123.9016,
  },
  "Basilica Pilgrim Center": {
    name: "Basilica Pilgrim Center",
    lat: 10.2947,
    lng: 123.9016,
  },
  "Cebu City Sports Center": {
    name: "Cebu City Sports Center",
    lat: 10.3033,
    lng: 123.8989,
  },
  "Fuente Osmeña": { name: "Fuente Osmeña", lat: 10.3089, lng: 123.8914 },
  "Plaza Independencia": {
    name: "Plaza Independencia",
    lat: 10.2925,
    lng: 123.9027,
  },
  "Ayala Center Cebu": {
    name: "Ayala Center Cebu",
    lat: 10.3187,
    lng: 123.9048,
  },
  "SM City Cebu": { name: "SM City Cebu", lat: 10.3114, lng: 123.9178 },
  "Pacific Grand Ballroom": {
    name: "Waterfront Cebu City",
    lat: 10.3152,
    lng: 123.9161,
  },
  "MCIAA T1": {
    name: "Mactan International Airport",
    lat: 10.3078,
    lng: 123.9794,
  },
  SRP: { name: "South Road Properties", lat: 10.2767, lng: 123.8824 },
  "Mandaue City": { name: "Mandaue City", lat: 10.3231, lng: 123.9334 },
  "Cebu City": { name: "Cebu City", lat: 10.3157, lng: 123.8854 },
};

// Location aliases for mapping different names to the same location
const locationAliases: { [key: string]: string } = {
  "The Gallery, Ayala Center Cebu": "Ayala Center Cebu",
  "The Terraces, Ayala Center": "Ayala Center Cebu",
};

const containerStyle = {
  width: "100%",
  height: "100vh", // Changed to full viewport height
};

const libraries = ["places"] as ["places"];

export default function SinulogMap() {
  const { isLoaded, loadError } = useLoadScript({
    googleMapsApiKey: process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY || "",
    libraries,
  });

  const [selectedLocation, setSelectedLocation] = useState<Location | null>(
    null
  );
  const [selectedDate, setSelectedDate] = useState<string>("2024-12-31");
  const [selectedEvent, setSelectedEvent] = useState<Event | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [userLocation, setUserLocation] = useState<google.maps.LatLng | null>(
    null
  );
  const [directions, setDirections] =
    useState<google.maps.DirectionsResult | null>(null);
  const [isLoadingDirections, setIsLoadingDirections] = useState(false);
  const [isRequestingLocation, setIsRequestingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  // Get all unique venues from the schedule
  const getAllVenues = useCallback(() => {
    const venues = new Set<string>();

    Object.values(schedule.schedule).forEach((events) => {
      events.forEach((event: Event) => {
        if (event.venue) {
          const venueKey = locationAliases[event.venue] || event.venue;
          if (locations[venueKey]) {
            venues.add(venueKey);
          }
        }
        if (event.venues) {
          event.venues.forEach((venue) => {
            const venueKey = locationAliases[venue] || venue;
            if (locations[venueKey]) {
              venues.add(venueKey);
            }
          });
        }
      });
    });

    return Array.from(venues)
      .filter((venue) => locations[venue])
      .map((venue) => locations[venue]);
  }, []);

  // Get locations for a specific event
  const getEventLocations = useCallback((event: Event): Location[] => {
    const eventLocations: Set<Location> = new Set();

    if (event.venue) {
      const venueKey = locationAliases[event.venue] || event.venue;
      if (locations[venueKey]) {
        eventLocations.add(locations[venueKey]);
      }
    }
    if (event.venues) {
      event.venues.forEach((venue) => {
        const venueKey = locationAliases[venue] || venue;
        if (locations[venueKey]) {
          eventLocations.add(locations[venueKey]);
        }
      });
    }

    return Array.from(eventLocations);
  }, []);

  // Check if a location belongs to the selected event
  const isLocationForSelectedEvent = useCallback(
    (location: Location): boolean => {
      if (!selectedEvent) return false;

      const eventLocations = getEventLocations(selectedEvent);
      return eventLocations.some(
        (loc) =>
          loc.lat === location.lat &&
          loc.lng === location.lng &&
          loc.name === location.name
      );
    },
    [selectedEvent, getEventLocations]
  );

  const dates = Object.keys(schedule.schedule).sort();
  const currentEvents =
    schedule.schedule[selectedDate as keyof typeof schedule.schedule] || [];

  // Search across all dates
  const searchResults = useMemo(() => {
    if (!searchQuery.trim()) {
      return [];
    }

    const query = searchQuery.toLowerCase();
    const results: Array<{ date: string; event: Event }> = [];

    Object.entries(schedule.schedule).forEach(([date, events]) => {
      events.forEach((event: Event) => {
        const eventName = event.event.toLowerCase();
        const venue = event.venue?.toLowerCase() || "";
        const venues = event.venues?.join(" ").toLowerCase() || "";
        const time = event.time.toLowerCase();
        const note = event.note?.toLowerCase() || "";

        if (
          eventName.includes(query) ||
          venue.includes(query) ||
          venues.includes(query) ||
          time.includes(query) ||
          note.includes(query)
        ) {
          results.push({ date, event });
        }
      });
    });

    return results;
  }, [searchQuery]);

  // Add map reference
  const mapRef = useRef<google.maps.Map | null>(null);

  // Add function to handle map load
  const onMapLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
  }, []);

  // Add function to handle event selection with zoom
  const handleEventSelection = useCallback(
    (event: Event) => {
      setSelectedEvent(event);
      const eventLocations = getEventLocations(event);

      if (eventLocations.length > 0) {
        setSelectedLocation(eventLocations[0]);

        // Zoom to location
        if (mapRef.current) {
          mapRef.current.panTo({
            lat: eventLocations[0].lat,
            lng: eventLocations[0].lng,
          });
          mapRef.current.setZoom(16);
        }
      }
    },
    [getEventLocations]
  );

  // Get user's current location
  const getCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) {
      setLocationError("Geolocation is not supported by your browser");
      return;
    }

    setIsRequestingLocation(true);
    setLocationError(null);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (window.google) {
          setUserLocation(
            new window.google.maps.LatLng(
              position.coords.latitude,
              position.coords.longitude
            )
          );
        }
        setIsRequestingLocation(false);
      },
      (error) => {
        setIsRequestingLocation(false);
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError(
              "Please enable location access in your browser settings to get directions"
            );
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError("Location information is unavailable");
            break;
          case error.TIMEOUT:
            setLocationError("Location request timed out");
            break;
          default:
            setLocationError("An unknown error occurred");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
      }
    );
  }, []);

  // Function to get directions
  const getDirections = useCallback(
    async (destination: Location) => {
      if (!userLocation) {
        getCurrentLocation();
        return;
      }

      if (!window.google) {
        setLocationError("Maps service is not available");
        return;
      }

      setIsLoadingDirections(true);
      const directionsService = new window.google.maps.DirectionsService();

      try {
        const result = await directionsService.route({
          origin: userLocation,
          destination: { lat: destination.lat, lng: destination.lng },
          travelMode: window.google.maps.TravelMode.DRIVING,
        });

        setDirections(result);
        if (mapRef.current) {
          mapRef.current.fitBounds(result.routes[0].bounds);
        }
      } catch (error) {
        console.error("Error getting directions:", error);
        setLocationError("Could not calculate directions. Please try again.");
      } finally {
        setIsLoadingDirections(false);
      }
    },
    [userLocation, getCurrentLocation]
  );

  // Function to clear directions
  const clearDirections = useCallback(() => {
    setDirections(null);
  }, []);

  // Initialize location on load
  useEffect(() => {
    if (isLoaded) {
      getCurrentLocation();
    }
  }, [isLoaded, getCurrentLocation]);

  if (loadError) {
    return <div className="text-center p-4">Error loading maps</div>;
  }

  if (!isLoaded) {
    return <div className="text-center p-4">Loading maps...</div>;
  }

  return (
    <div className="flex h-screen">
      {/* Left Column - Events List */}
      <div className="w-1/3 overflow-hidden border-r border-gray-200 bg-white flex flex-col">
        {/* Title Section */}
        <div className="bg-white p-6 border-b border-gray-200">
          <h1 className="text-3xl font-bold text-red-600 mb-2">Sinulog 2025</h1>
          <p className="text-black">One Beat, One Dance, One Vision</p>
        </div>

        {/* Search Bar */}
        <div className="bg-white p-4 border-b border-gray-200">
          <div className="relative">
            <input
              type="text"
              placeholder="Search all events, venues, or times..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-4 py-2 pr-10 bg-gray-50 border border-gray-200 rounded-lg 
                       text-gray-900 placeholder-gray-500 focus:outline-none focus:ring-2 
                       focus:ring-orange-500 focus:border-transparent"
            />
            <svg
              className="absolute right-3 top-2.5 h-5 w-5 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
          </div>
          <p className="text-sm text-gray-600 mt-2">
            {searchQuery.trim()
              ? `${searchResults.length} results found across all dates`
              : `${currentEvents.length} events on ${selectedDate}`}
          </p>
        </div>

        {/* Date Tabs */}
        <div className="bg-white border-b border-gray-200 overflow-x-auto py-2">
          <div className="flex whitespace-nowrap px-2 gap-2">
            {dates.map((date) => (
              <button
                key={date}
                data-date={date}
                className={`px-4 py-2 text-sm font-medium transition-all duration-200 rounded-full ${
                  selectedDate === date
                    ? "bg-red-600 text-white shadow-sm"
                    : "bg-gray-100 text-black hover:bg-red-50 hover:text-red-600"
                }`}
                onClick={() => {
                  setSelectedDate(date);
                  setSelectedEvent(null);
                  setSelectedLocation(null);
                  setSearchQuery("");
                  // Reset map zoom
                  if (mapRef.current) {
                    mapRef.current.setZoom(13);
                    mapRef.current.panTo(center);
                  }
                }}
              >
                {date}
              </button>
            ))}
          </div>
        </div>

        {/* Events List */}
        <div className="flex-1 overflow-auto bg-white">
          <div className="space-y-4 p-4">
            {searchQuery.trim()
              ? // Search results
                searchResults.map(({ date, event }, index) => (
                  <div
                    key={index}
                    className={`group p-4 rounded-xl border transition-all duration-200 hover:shadow-md cursor-pointer ${
                      selectedEvent === event && selectedDate === date
                        ? "bg-red-50 border-red-200"
                        : "bg-white border-gray-200 hover:border-red-200"
                    }`}
                    onClick={() => {
                      setSelectedDate(date);
                      handleEventSelection(event);
                    }}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h3
                          className={`font-bold text-lg group-hover:text-red-600 transition-colors duration-200 ${
                            selectedEvent === event
                              ? "text-red-600"
                              : "text-gray-900"
                          }`}
                        >
                          {event.event}
                        </h3>
                        <p className="text-sm text-gray-500 mt-1">
                          Date: {date}
                        </p>
                      </div>
                      <span className="px-3 py-1 bg-red-50 text-red-600 text-sm rounded-full">
                        {event.time}
                      </span>
                    </div>

                    <div className="space-y-2 mt-3">
                      {event.venue && (
                        <div className="flex items-center text-gray-600">
                          <svg
                            className="w-4 h-4 mr-2 text-red-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                          <span>{event.venue}</span>
                        </div>
                      )}
                      {event.venues && (
                        <div className="flex items-start text-gray-600">
                          <svg
                            className="w-4 h-4 mr-2 mt-1 flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                          <span>{event.venues.join(", ")}</span>
                        </div>
                      )}
                      {event.note && (
                        <div className="flex items-start text-gray-600 text-sm">
                          <svg
                            className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <span>{event.note}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))
              : // Current date events
                currentEvents.map((event: Event, index) => (
                  <div
                    key={index}
                    className={`group p-4 rounded-xl border transition-all duration-200 hover:shadow-md cursor-pointer ${
                      selectedEvent === event
                        ? "bg-red-50 border-red-200"
                        : "bg-white border-gray-200 hover:border-red-200"
                    }`}
                    onClick={() => handleEventSelection(event)}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <h3
                        className={`font-bold text-lg group-hover:text-red-600 transition-colors duration-200 ${
                          selectedEvent === event
                            ? "text-red-600"
                            : "text-gray-900"
                        }`}
                      >
                        {event.event}
                      </h3>
                      <span className="px-3 py-1 bg-red-50 text-red-600 text-sm rounded-full">
                        {event.time}
                      </span>
                    </div>

                    <div className="space-y-2 mt-3">
                      {event.venue && (
                        <div className="flex items-center text-gray-600">
                          <svg
                            className="w-4 h-4 mr-2 text-red-500"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                          <span>{event.venue}</span>
                        </div>
                      )}
                      {event.venues && (
                        <div className="flex items-start text-gray-600">
                          <svg
                            className="w-4 h-4 mr-2 mt-1 flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
                            />
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
                            />
                          </svg>
                          <span>{event.venues.join(", ")}</span>
                        </div>
                      )}
                      {event.note && (
                        <div className="flex items-start text-gray-600 text-sm">
                          <svg
                            className="w-4 h-4 mr-2 mt-0.5 flex-shrink-0"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth="2"
                              d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                            />
                          </svg>
                          <span>{event.note}</span>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
          </div>
        </div>
      </div>

      {/* Right Column - Map */}
      <div className="w-2/3">
        <GoogleMap
          mapContainerStyle={containerStyle}
          center={selectedLocation || center}
          zoom={selectedLocation ? 16 : 13}
          onLoad={onMapLoad}
          options={{
            styles: [
              {
                featureType: "poi",
                elementType: "labels",
                stylers: [{ visibility: "off" }],
              },
            ],
            zoomControl: true,
            mapTypeControl: false,
            streetViewControl: false,
            fullscreenControl: false,
          }}
        >
          {/* Show user location marker */}
          {userLocation && (
            <Marker
              position={userLocation}
              icon={{
                url: "http://maps.google.com/mapfiles/ms/icons/green-dot.png",
                scaledSize: new window.google.maps.Size(40, 40),
              }}
            />
          )}

          {/* Show directions if available */}
          {directions && (
            <DirectionsRenderer
              directions={directions}
              options={{
                polylineOptions: {
                  strokeColor: "#1e3a8a", // Dark blue color
                  strokeWeight: 5,
                  strokeOpacity: 0.8,
                },
              }}
            />
          )}

          {/* Show venue markers only if no directions are displayed */}
          {!directions &&
            (selectedEvent
              ? getEventLocations(selectedEvent)
              : getAllVenues()
            ).map((location) => (
              <Marker
                key={`${location.name}-${location.lat}-${location.lng}`}
                position={{ lat: location.lat, lng: location.lng }}
                onClick={() => setSelectedLocation(location)}
                animation={
                  selectedEvent && isLocationForSelectedEvent(location)
                    ? window.google.maps.Animation.DROP
                    : undefined
                }
                icon={{
                  url: isLocationForSelectedEvent(location)
                    ? "http://maps.google.com/mapfiles/ms/icons/red-dot.png"
                    : "http://maps.google.com/mapfiles/ms/icons/blue-dot.png",
                  scaledSize: new window.google.maps.Size(
                    isLocationForSelectedEvent(location) ? 40 : 30,
                    isLocationForSelectedEvent(location) ? 40 : 30
                  ),
                }}
              />
            ))}

          {selectedLocation && (
            <InfoWindow
              position={{
                lat: selectedLocation.lat,
                lng: selectedLocation.lng,
              }}
              onCloseClick={() => {
                setSelectedLocation(null);
              }}
            >
              <div className="p-2">
                <h3 className="font-bold text-black text-lg">
                  {selectedLocation.name}
                </h3>
                {selectedEvent &&
                  isLocationForSelectedEvent(selectedLocation) && (
                    <>
                      <p className="text-black font-medium mt-2">
                        {selectedEvent.event}
                      </p>
                      <p className="text-black mt-1">
                        Time: {selectedEvent.time}
                      </p>
                      {selectedEvent.note && (
                        <p className="text-black mt-1 text-sm">
                          Note: {selectedEvent.note}
                        </p>
                      )}
                      {locationError && (
                        <p className="text-red-600 text-sm mt-2">
                          {locationError}
                        </p>
                      )}
                      <button
                        onClick={() => {
                          setLocationError(null);
                          getDirections(selectedLocation);
                        }}
                        disabled={isLoadingDirections || isRequestingLocation}
                        className="mt-3 w-full px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
                      >
                        {isLoadingDirections
                          ? "Getting directions..."
                          : isRequestingLocation
                          ? "Getting your location..."
                          : "Get Directions"}
                      </button>
                      {directions && (
                        <button
                          onClick={() => {
                            clearDirections();
                            setLocationError(null);
                          }}
                          className="mt-2 w-full px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                        >
                          Clear Directions
                        </button>
                      )}
                    </>
                  )}
              </div>
            </InfoWindow>
          )}
        </GoogleMap>
      </div>
    </div>
  );
}
