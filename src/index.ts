import './index.css';
import { map, tileLayer, divIcon, marker, polygon } from 'leaflet';

const mapObject = map('map').setView([36.7783, -119.4179], 6);

tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
}).addTo(mapObject);

const testIcon = divIcon({
    className: 'custom-svg-marker',
    html: `
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="32" height="32">
            <path fill="#e74c3c" d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
        </svg>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
});

tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
}).addTo(mapObject);

marker([33.782581, -118.189319]).addTo(mapObject)
    .bindPopup('California 0');

marker([33.774109, -118.189319], { icon: testIcon }).addTo(mapObject)
    .bindPopup('California 1');

polygon([
    [33.835408, -118.257158],
    [33.835408, -118.248478],
    [33.831701, -118.248489],
    [33.831701, -118.257179],
]).addTo(mapObject).bindPopup('Something has happened here').openPopup();
