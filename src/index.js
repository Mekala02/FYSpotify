import { initializeApp } from "firebase/app";
import { getDatabase, ref, onValue, set, update, remove, onDisconnect} from "firebase/database"
import { getAuth, signInWithCustomToken } from "firebase/auth";
import "./main.sass";
import "./images/default_pp.png";
import "./images/spotify_logo.svg";
import "./images/spotify_logo_black.svg";

// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const redirect_uri = "https://fyspotify.xyz";
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
// List of active jams
var active_jams = new Array();
const spotify_client_id = "0806329d039f45cdb2535f4767d7aa4a"

async function onPageLoad() {
    window.sessionStorage.clear();
    // Triggers when there is a change in the database
    onValue(ref(db, "jams/"), (snapshot) => {
        const participated_jam = sessionStorage.getItem("participated_jam");
        // Loop through all the jams
        snapshot.forEach((childSnapshot) => {
            const jam_id = childSnapshot.key;
            const data = childSnapshot.val();
            // If the jam is not in the active jams list, construct it
            if (!active_jams.includes(jam_id)){
                active_jams.push(jam_id);
                var jam_container = construct_jam_container(jam_id);
                document.getElementById("JamsContainer").appendChild(jam_container);
                document.getElementById(`Jam${jam_id}`).addEventListener("click", function(event) {
                    if (event.target.tagName !== 'IMG') {
                        // Call join_jam only if the clicked element is not a link
                        join_jam(jam_id);
                    }
                }, false);
            }
            // Update jam state
            sessionStorage.setItem(`Jam${jam_id}`, JSON.stringify(data));
            modify_jam(jam_id, "JamName", data.jam_name);
            // Make jam name editable by users
            document.getElementById(`JamName${jam_id}`).ondblclick = function() {
                makeEditable(jam_id);
            };
            modify_jam(jam_id, "TrackTitle", data.track_title);
            modify_jam(jam_id, "TrackArtist", data.track_artist);
            modify_jam(jam_id, "AlbumImage", data.album_image);
            modify_jam(jam_id, "SpotifyLink", data.music_url);
            // Remove all participants from the client side and re-add based on the database
            const participants_container = document.getElementById(`JamParticipants${jam_id}`);
            while (participants_container.firstChild) {
                participants_container.removeChild(participants_container.lastChild);
            }
            for (const key in data.participants){
                add_participant_to_jam(jam_id, key, data.participants[key].picture_url)
            }
            // If the user is inside this jam, update the jam
            if (jam_id == participated_jam){
                const no_active_device = sessionStorage.getItem("no_active_device");
                // Highlight the jam
                document.getElementById(`Jam${participated_jam}`).style.backgroundColor = '#82aa2f';
                document.getElementById(`SpotifyLinkImg${participated_jam}`).src = "images/spotify_logo_black.svg"
                const is_playing = data.is_playing
                const music_url = data.music_url
                 // Update playback state if someone other than the client changed it 
                if ((no_active_device == "false") && (sessionStorage.getItem("is_playing") != String(is_playing))){
                    change_playback_state(is_playing);
                }
                // Update music if someone other than the client changed it
                if ((no_active_device == "false") && (sessionStorage.getItem("music_url") != String(music_url))){
                    change_music(music_url);
                }
                // Remove client from the jam if disconnected
                const onDisconnectRef = ref(db, `jams/${participated_jam}/participants/${localStorage.getItem("usr_id")}`);
                onDisconnect(onDisconnectRef).set(null);
            }
        });
        // Remove deleted jam from HTML (server-side deletes unused jams)
        for (const jam_id of active_jams){
            if (snapshot.val() && !(jam_id in snapshot.val())){
                document.getElementById(`Jam${jam_id}`).remove();
                active_jams.splice(active_jams.indexOf(jam_id), 1);
            }
        }
    });
    const queryString = window.location.search;
    // If logged in
    if (queryString.length > 0) {
        const urlParams = new URLSearchParams(queryString);
        const code = urlParams.get('code');
        try {
            const response = await fetch('https://us-central1-fyspotify-f83f1.cloudfunctions.net/getToken?code=' + code);
            const data = await response.json();
            await firebase_log_in(data.firebase_token)
            localStorage.setItem('access_token', data.access_token);
            localStorage.setItem('refresh_token', data.refresh_token);
            localStorage.setItem('firebase_token', data.firebase_token);
            localStorage.setItem('token_timestamp', Date.now());
            setInterval(check_token_time, 60 * 1000);
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
            await firebase_log_in(localStorage.getItem('firebase_token'))
            document.getElementById("Login_Button").style.display = 'none';
            document.getElementById("Profile_Photo").style.display = 'block';
            document.getElementById("Profile_Photo").src = localStorage.getItem("profile_picture");
            setInterval(GetSpotify, 250);
            setInterval(check_token_time, 60 * 1000);
        } else {
            document.getElementById("Profile_Photo").style.display = 'none';
            document.getElementById("Login_Button").style.display = 'block';
        }
    }
}

async function check_token_time(){
    const last_token_timestamp = localStorage.getItem('token_timestamp');
    const current_time = Date.now()
    const diff = current_time-last_token_timestamp
    // If refresh token is expired
    if (diff > 3600 * 1000){
        logout()
    }
    // If 50 mins pased since we get acces token refresh the token
    else if (diff > 3000 * 1000){
        try {
            const response = await fetch('https://us-central1-fyspotify-f83f1.cloudfunctions.net/refreshToken?refresh_token=' + localStorage.getItem('refresh_token'));
            const data = await response.json();
            console.log(data)
            localStorage.setItem('access_token', data.access_token);
            localStorage.setItem('refresh_token', data.refresh_token);
            localStorage.setItem('firebase_token', data.firebase_token);
            localStorage.setItem('token_timestamp', Date.now());
        } catch (error) {
            console.error(error);
            logout()
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

    var jam_middle_right = document.createElement("div");
    jam_middle_right.setAttribute("class", "JamMiddleRightContainer");

    var spotify_link = document.createElement("div");
    spotify_link.setAttribute("class", "SpotifyLinkContainer");

    var a_link = document.createElement("a");
    a_link.setAttribute("target", "_blank");
    a_link.setAttribute("id", `SpotifyLinkA${id}`);

    var spotify_logo = document.createElement("img");
    spotify_logo.setAttribute("class", "SpotifyLink");
    spotify_logo.setAttribute("id", `SpotifyLinkImg${id}`);
    spotify_logo.setAttribute("src", "images/spotify_logo.svg");

    a_link.appendChild(spotify_logo);
    spotify_link.appendChild(a_link);

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

    jam_middle_right.appendChild(title_artist);
    jam_middle_right.appendChild(spotify_link);
    jam_middle.appendChild(jam_middle_right);
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
        else if (field == "SpotifyLink")
            document.getElementById(`SpotifyLinkA${id}`).href = value;
    }catch(error){
        console.error(error)
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
    if (localStorage.getItem("access_token")){
        exit_jam()
        sessionStorage.setItem("participated_jam", Id);
        document.getElementById(`Jam${Id}`).style.backgroundColor = '#82aa2f';
        const reference = ref(db, `jams/${Id}/participants/${localStorage.getItem("usr_id")}`)
        set(reference, {
            picture_url: localStorage.getItem("profile_picture"),
        })
    }
    else{
        console.error("You Need To Login First")
    }
}

function exit_jam(){
    const participated_jam = sessionStorage.getItem("participated_jam");
    if(participated_jam){
        document.getElementById(`SpotifyLinkImg${participated_jam}`).src = "images/spotify_logo.svg"
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
    document.getElementById("Login_Button").style.display = 'none';
    document.getElementById("Profile_Photo").style.display = 'block';

    const profile_info = await fetchWebApi('v1/me', 'GET');
    const profile_picture = profile_info.images[0]
    // console.log(profile_info);
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

async function firebase_log_in(firebase_token){
    const auth = getAuth();
    await signInWithCustomToken(auth, firebase_token)
        .then((userCredential) => {
        // console.log(userCredential.user)
        })
        .catch((error) => {
            console.error(error);
            logout();
        });
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
            console.error("Pleas Select Device")
        }
    } catch (error) {
        if (error.message === "Fetch error: 401 - Unauthorized") {
            logout();
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
    localStorage.removeItem("firebase_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("token_timestamp");
    location.reload()
}

function create_jam(){
    if (localStorage.getItem("access_token")){
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
    else{
        console.error("You Need To Login First")
    }
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
