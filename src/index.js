import { initializeApp } from "firebase/app";
import { getDatabase, onValue, ref, set, update, remove, onDisconnect} from "firebase/database"
import { getAuth, signInWithCustomToken } from "firebase/auth";
import "./main.sass";
import "./images/default_pp.png";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const redirect_uri = "http://127.0.0.1:5500/";
const firebaseConfig = {
    apiKey: "AIzaSyBBuPBTFnu_oeeba5vJ60fmp1hxNuexckY",
    authDomain: "fyspotify-f83f1.firebaseapp.com",
    databaseURL: "https://fyspotify-f83f1-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "fyspotify-f83f1",
    storageBucket: "fyspotify-f83f1.appspot.com",
    messagingSenderId: "126989404303",
    appId: "1:126989404303:web:738d541c21e6cbed6308fa",
    measurementId: "G-HFTCS9F9X3"
};
initializeApp(firebaseConfig);
const db = getDatabase();
// List of the active jams
var active_jams = new Array();
const spotify_client_id = "0806329d039f45cdb2535f4767d7aa4a"

async function onPageLoad() {
    window.sessionStorage.clear();
    // Trigers when change happens in database
    onValue(ref(db, "jams/"), (snapshot) => {
        const participated_jam = sessionStorage.getItem("participated_jam");
        // Looping over all the jams
        snapshot.forEach((childSnapshot) => {
            const jam_id = childSnapshot.key;
            const data = childSnapshot.val();
            // If client doesnt have that jam we constructing it
            if (!active_jams.includes(jam_id)){
                active_jams.push(jam_id);
                var jam_container = construct_jam_container(jam_id);
                document.getElementById("JamsContainer").appendChild(jam_container);
                document.getElementById(`Jam${jam_id}`).addEventListener("click", function(){join_jam(jam_id)}, false);
            }
            // Updating the jams state
            sessionStorage.setItem(`Jam${jam_id}`, JSON.stringify(data));
            modify_jam(jam_id, "JamName", data.jam_name);
            // Make jame name editable by users
            document.getElementById(`JamName${jam_id}`).ondblclick = function() {
                makeEditable(jam_id);
            };
            modify_jam(jam_id, "TrackTitle", data.track_title);
            modify_jam(jam_id, "TrackArtist", data.track_artist);
            modify_jam(jam_id, "AlbumImage", data.album_image);
            // Deleting all participants from client side then readding based on database
            const participants_container = document.getElementById(`JamParticipants${jam_id}`);
            while (participants_container.firstChild) {
                participants_container.removeChild(participants_container.lastChild);
            }
            for (const key in data.participants){
                add_participant_to_jam(jam_id, key, data.participants[key].picture_url)
            }
            // If we inside this jam we updating the jam
            if (jam_id == participated_jam){
                const no_active_device = sessionStorage.getItem("no_active_device");
                document.getElementById(`Jam${participated_jam}`).style.backgroundColor = '#82aa2f';
                const is_playing = data.is_playing
                const music_url = data.music_url
                // If someone other then our client changed the playback state 
                if ((no_active_device == "false") && (sessionStorage.getItem("is_playing") != String(is_playing))){
                    change_playback_state(is_playing);
                }
                // If someone other then our client changed the music
                if ((no_active_device == "false") && (sessionStorage.getItem("music_url") != String(music_url))){
                    change_music(music_url);
                }
                // If client disconnects deleting it from the jam
                const onDisconnectRef = ref(db, `jams/${participated_jam}/participants/${localStorage.getItem("usr_id")}`);
                onDisconnect(onDisconnectRef).set(null);
            }
        });
        // Remoce deleted jam from html (server side deletes unused jams)
        for (const jam_id of active_jams){
            if (snapshot.val() && !(jam_id in snapshot.val())){
                document.getElementById(`Jam${jam_id}`).remove();
                active_jams.splice(active_jams.indexOf(jam_id), 1);
            }
        }
    });
    const queryString = window.location.search;
    // If we logged in
    if (queryString.length > 0) {
        const urlParams = new URLSearchParams(queryString);
        const code = urlParams.get('code');
        try {
            const response = await fetch('https://us-central1-fyspotify-f83f1.cloudfunctions.net/getToken?code=' + code);
            const data = await response.json();
            localStorage.setItem('access_token', data.access_token);
            // localStorage.setItem('refresh_token', data.refresh_token);
            localStorage.setItem('firebase_token', data.firebase_token);
            handle_log_in()
        } catch (error) {
            console.error(error);
            alert(error.message);
        }
        window.history.pushState("", "", redirect_uri);
    }
    // If we refresh the page when we logged in
    else {
        if (localStorage.getItem("access_token")) {
            const auth = getAuth();
            await signInWithCustomToken(auth, localStorage.getItem('firebase_token'))
                .then((userCredential) => {
                console.log(userCredential.user)
                })
            document.getElementById("Login_Button").style.display = 'none';
            document.getElementById("Profile_Photo").style.display = 'block';
            document.getElementById("Profile_Photo").src = localStorage.getItem("profile_picture");
            setInterval(GetSpotify, 250);
        } else {
            document.getElementById("Profile_Photo").style.display = 'none';
            document.getElementById("Login_Button").style.display = 'block';
        }
    }
}

function construct_jam_container(id){
    var jam_container = document.createElement("div");
    jam_container.setAttribute("class", "JamContainer");
    jam_container.setAttribute("id", `Jam${id}`);

    var jam_top = document.createElement("div");
    jam_top.setAttribute("class", "JamTop");

    var jam_name = document.createElement("div");
    jam_name.setAttribute("class", "JamName");
    jam_name.setAttribute("id", `JamName${id}`);
    // jam_name.textContent = name;
    jam_top.appendChild(jam_name);

    var jam_participants = document.createElement("section");
    jam_participants.setAttribute("class", "JamParticipants");
    jam_participants.setAttribute("id", `JamParticipants${id}`);

    jam_top.appendChild(jam_participants);

    var jam_middle = document.createElement("div");
    jam_middle.setAttribute("class", "JamMiddle");

    var album_image = document.createElement("img");
    album_image.setAttribute("class", "AlbumImage");
    album_image.setAttribute("id", `AlbumImage${id}`);
    jam_middle.appendChild(album_image);

    var title_artist = document.createElement("div");
    title_artist.setAttribute("class", "TitleArtist");
    title_artist.setAttribute("id", `TitleArtist${id}`);

    var track_title = document.createElement("div");
    track_title.setAttribute("class", "TrackTitle");
    track_title.setAttribute("id", `TrackTitle${id}`);
    title_artist.appendChild(track_title);

    var track_artist = document.createElement("div");
    track_artist.setAttribute("class", "TrackArtist");
    track_artist.setAttribute("id", `TrackArtist${id}`);
    title_artist.appendChild(track_artist);

    jam_middle.appendChild(title_artist);
    jam_container.appendChild(jam_top);
    jam_container.appendChild(jam_middle);

    return jam_container
}

function modify_jam(id, field, value) {
    try{
        if (field == "JamName" || field == "TrackTitle" ||  field == "TrackArtist")
            document.getElementById(`${field}${id}`).textContent = value;
        else if (field == "AlbumImage")
            document.getElementById(`AlbumImage${id}`).src = value;
    }catch(error){
        console.log(error)
    }
}

function makeEditable(id) {
    const element = document.getElementById(`JamName${id}`);
    // Create an input element
    const inputElement = document.createElement('input');
    inputElement.type = 'text';
    inputElement.value = element.textContent;
    const computedStyle = window.getComputedStyle(element);
    // Replace the div content with the input element
    element.textContent = '';
    // Set the input element style
    inputElement.style.width = 'auto';
    inputElement.style.border = 'none';
    inputElement.style.background = 'none';
    inputElement.style.outline = 'none';
    inputElement.style.fontSize = computedStyle.fontSize;
    inputElement.style.color = computedStyle.color;

    element.appendChild(inputElement);

    // Focus on the input element
    inputElement.focus();
    // Select the text in the input element
    inputElement.select();

    // Handle Enter key press to save changes
    inputElement.addEventListener('blur', () => {
        // element.textContent = inputElement.value
        const reference = ref(db, 'jams/' + id)
        update(reference, {
            jam_name: inputElement.value.substring(0, 15),
        })
    });
  }

async function join_jam(Id){
    exit_jam()
    sessionStorage.setItem("participated_jam", Id);
    document.getElementById(`Jam${Id}`).style.backgroundColor = '#82aa2f';
    const reference = ref(db, `jams/${Id}/participants/${localStorage.getItem("usr_id")}`)
    set(reference, {
        picture_url: localStorage.getItem("profile_picture"),
    })
}

function exit_jam(){
    const participated_jam = sessionStorage.getItem("participated_jam");
    if(participated_jam){
        const usr_id  = localStorage.getItem("usr_id")
        sessionStorage.setItem("participated_jam", null);
        document.getElementById(`Jam${participated_jam}`).style.backgroundColor = '';
        const reference = ref(db, `jams/${participated_jam}/participants/${usr_id}`)
        remove(reference)
    }
}

function add_participant_to_jam(jam_id, usr_id, picture_url) {
    if(!document.getElementById(`ParticipantPhoto${usr_id}`)){
        var participant_photo = document.createElement("img");
        participant_photo.setAttribute("class", "ParticipantPhoto");
        participant_photo.setAttribute("id", `ParticipantPhoto${usr_id}`);
        participant_photo.src = picture_url;
        document.getElementById(`JamParticipants${jam_id}`).appendChild(participant_photo);
    }
}

async function change_playback_state(is_playing){
    if (is_playing)
        await fetchWebApi('v1/me/player/play', 'PUT');
    else
        await fetchWebApi('v1/me/player/pause', 'PUT');
}

async function change_music(music_url){
    const data = await fetchWebApi(`v1/tracks/${music_url.split("/")[4]}`, 'GET');
    const albume_uri = data.album.uri
    const track_number = data.track_number
        const body = {
            context_uri: albume_uri,
            offset: {
                position: track_number - 1
            },
            position_ms: 0
        };
        await fetchWebApi('v1/me/player/play', 'PUT', body);
}

async function handle_log_in() {
    // Sign in to firebase
    const auth = getAuth();
    await signInWithCustomToken(auth, localStorage.getItem('firebase_token'))
        .then((userCredential) => {
        console.log(userCredential.user)
        })
    document.getElementById("Login_Button").style.display = 'none';
    document.getElementById("Profile_Photo").style.display = 'block';

    const profile_info = await fetchWebApi('v1/me', 'GET');
    const profile_picture = profile_info.images[0]
    console.log(profile_info);
    localStorage.setItem("usr_id", profile_info.id);
    localStorage.setItem("usr_name", profile_info.display_name);
    if (profile_picture)
        localStorage.setItem("profile_picture", profile_picture.url);
    // If user dont have profile picture seting it to default one
    else
        localStorage.setItem("profile_picture", "images/default_pp.png");
    document.getElementById("Profile_Photo").src = localStorage.getItem("profile_picture");
    setInterval(GetSpotify, 250);
}

async function GetSpotify() {
    try {
        const data = await fetchWebApi('v1/me/player', 'GET');
        if (data) {
            sessionStorage.setItem("no_active_device", false);
            const music_url = data.item.external_urls.spotify
            const is_playing = data.is_playing
            const progress_ms = data.progress_ms;
            const albume_uri = data.item.album.uri
            const track_number = data.item.track_number
            const album_image = data.item.album.images[0].url;
            const track_title = data.item.name;
            const track_artist = data.item.artists[0].name;
            const participated_jam = sessionStorage.getItem("participated_jam");

            const play_state_change = sessionStorage.getItem("is_playing") != String(is_playing)
            const music_change = sessionStorage.getItem("music_url") != String(music_url)
            sessionStorage.setItem("music_url", music_url);
            sessionStorage.setItem("is_playing", is_playing);
            sessionStorage.setItem("albume_uri", albume_uri);
            sessionStorage.setItem("track_number", track_number);
            sessionStorage.setItem("track_title", track_title);
            sessionStorage.setItem("track_artist", track_artist);
            sessionStorage.setItem("album_image", album_image);
            sessionStorage.setItem("progress_ms", progress_ms);
            if (participated_jam){
                if (play_state_change ||
                    music_change){
                    const reference = ref(db, 'jams/' + participated_jam)
                    update(reference, {
                        music_url: music_url,
                        is_playing: is_playing,
                        track_title: track_title,
                        track_artist: track_artist,
                        album_image: album_image
                    })
                }
            }

        }
        else{
            sessionStorage.setItem("no_active_device", true);
            console.log("Pleas Select Device")
        }
    } catch (error) {
        if (error.message === "Fetch error: 401 - Unauthorized") {
            refresh_access_token();
        } else {
            console.error(error);
        }
    }
}

async function fetchWebApi(endpoint, method, body) {
    const res = await fetch(`https://api.spotify.com/${endpoint}`, {
        method,
        headers: {
            'Authorization': `Bearer ${localStorage.getItem("access_token")}`
        },
        body: JSON.stringify(body)
    });
    if (!res.ok) {
        throw new Error(`Fetch error: ${res.status} - ${await res.text()}`);
    }
    // Check if response has content before trying to parse as JSON
    const responseBody = await res.text();
    const jsonData = responseBody ? JSON.parse(responseBody) : null;

    return jsonData;
}

// async function refresh_access_token() {
//     const refresh_token = localStorage.getItem("refresh_token");
//     const body = new URLSearchParams();
//     body.append('grant_type', 'refresh_token');
//     body.append('refresh_token', refresh_token);
//     body.append('client_id', spotify_client_id);

//     try {
//         await callAuthorizationApi(body.toString());
//     } catch (error) {
//         console.error(error);
//     }
// }

function request_authorization() {
    const url = new URL("https://accounts.spotify.com/authorize");
    url.searchParams.append('client_id', spotify_client_id);
    url.searchParams.append('response_type', 'code');
    url.searchParams.append('redirect_uri', redirect_uri);
    url.searchParams.append('show_dialog', 'true');
    url.searchParams.append('scope', 'user-read-private user-read-email user-modify-playback-state user-read-playback-position user-library-read streaming user-read-playback-state user-read-recently-played playlist-read-private user-top-read user-follow-read');
    window.location.href = url.toString();
}

function logout() {
    // Clear the authorization data from local storage
    localStorage.removeItem("access_token");
    // localStorage.removeItem("refresh_token");
    location.reload()
}

function create_jam(){
    exit_jam()
    const participated_jam = findMinMissingNumber(active_jams)
    sessionStorage.setItem("participated_jam", participated_jam);

    const reference = ref(db, 'jams/' + participated_jam)
    var obj = {};
    obj[localStorage.getItem("usr_id")] = {picture_url: localStorage.getItem("profile_picture")};
    set(reference, {
        jam_name: `${localStorage.getItem("usr_name")}'s Room`,
        music_url: sessionStorage.getItem("music_url"),
        is_playing: sessionStorage.getItem("is_playing"),        
        track_title: sessionStorage.getItem("track_title"),
        track_artist: sessionStorage.getItem("track_artist"),
        album_image: sessionStorage.getItem("album_image"),
        participants: obj
        // progress_ms: sessionStorage.getItem("progress_ms")
    })
}

function findMinMissingNumber(arr) {
    // Convert strings to numbers and sort the array in ascending order
    const sortedArr = arr.map(Number).sort((a, b) => a - b);
    let expectedNumber = 0;
    for (const number of sortedArr) {
        if (number > expectedNumber) {
            // Found a gap in the sequence, return the missing number
            return expectedNumber;
        }
        expectedNumber = number + 1;
    }
    // If no missing number found, return the next number after the largest in the list
    return sortedArr.length > 0 ? sortedArr[sortedArr.length - 1] + 1 : 0;
}

window.onload = onPageLoad;
document.getElementById("Login_Button").addEventListener("click", request_authorization);
document.getElementById("Profile_Photo").addEventListener("click", logout);
document.getElementById("CreateJamButton").addEventListener("click", create_jam);
