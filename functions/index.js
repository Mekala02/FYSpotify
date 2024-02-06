const functions = require('firebase-functions');
const admin = require('firebase-admin');
const fetch = require('node-fetch');
const cors = require('cors')({ origin: true }); // Automatically allows all origins
admin.initializeApp();

exports.trackUserCount = functions.database.ref('/jams/{jamId}/participants/{usr_id}')
    .onDelete(async (snapshot, context) => {
    try {
        const jamId = context.params.jamId;
        const usr_id = context.params.usr_id;
        console.log(`Removing participant: ${usr_id} from jam: ${jamId}`);

        // Your logic to check if the jam has any participants
        const jamSnapshot = await admin.database().ref(`/jams/${jamId}`).once('value');
        const jamData = jamSnapshot.val();

        if (jamData && jamData.participants) {
        // The jam has participants
        console.log(`Jam ${jamId} still has participants.`);
        } else {
        // The jam has no participants, you can perform additional actions here if needed
        console.log(`Jam ${jamId} has no more participants. Deleting the jam...`);
        await admin.database().ref(`/jams/${jamId}`).remove();
        console.log(`Jam ${jamId} deleted.`);
        }

        return null;
    } catch (error) {
        console.error('Error in trackUserCount function:', error);
        return null;
    }
  });

exports.getToken = functions.https.onRequest(async (req, res) => {
    /*
    Make sure to deploy the Firebase Function using firebase deploy --only functions after adding the code.
    Also, set up environment variables for your Firebase Function using firebase
    functions:config:set spotify.client_id="YOUR_CLIENT_ID"
    spotify.client_secret="YOUR_CLIENT_SECRET"
    */
    cors(req, res, async () => {
        try {
            const code = req.query.code;
            const clientId = functions.config().spotify.client_id;
            const clientSecret = functions.config().spotify.client_secret;
            const redirectURI = req.headers.origin
            const response = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${Buffer.from(clientId + ':' + clientSecret).toString('base64')}`,
                },
                body: new URLSearchParams({
                'grant_type': 'authorization_code',
                'code': code,
                'redirect_uri': redirectURI,
                }),
            });

            const data = await response.json();
            const { access_token, refresh_token } = data;
            const firebase_token = await handle_new_spotify_token(access_token, refresh_token);
            res.json({ access_token, refresh_token, firebase_token });

        } catch (error) {
            console.error('Error:', error);
            res.status(500).send('Internal Server Error');
        }
    });
});

exports.refreshToken = functions.https.onRequest(async (req, res) => {
    /*
    Make sure to deploy the Firebase Function using firebase deploy --only functions after adding the code.
    Also, set up environment variables for your Firebase Function using firebase
    functions:config:set spotify.client_id="YOUR_CLIENT_ID"
    spotify.client_secret="YOUR_CLIENT_SECRET"
    */
    cors(req, res, async () => {
        try {
            const current_refresh_token = req.query.refresh_token;
            const clientId = functions.config().spotify.client_id;
            const clientSecret = functions.config().spotify.client_secret;

            const response = await fetch('https://accounts.spotify.com/api/token', {
                method: 'POST',
                headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': `Basic ${Buffer.from(clientId + ':' + clientSecret).toString('base64')}`,
                },
                body: new URLSearchParams({
                'grant_type': 'refresh_token',
                'refresh_token': current_refresh_token,
                }),
            });

            const data = await response.json();
            const { access_token } = data;
            const firebase_token = await handle_new_spotify_token(access_token, current_refresh_token);
            res.json({ access_token, current_refresh_token, firebase_token });
        } catch (error) {
            console.error('Error:', error);
            res.status(500).send('Internal Server Error');
        }
    });
});

async function handle_new_spotify_token(access_token, refresh_token){
    const spotifyResponse = await fetch('https://api.spotify.com/v1/me', {
        headers: {
        Authorization: `Bearer ${access_token}`
        }
    });
    const profile_info = await spotifyResponse.json();
    const id = profile_info.id;
    const profile_picture = profile_info.images
    const firebase_token = await admin.auth().createCustomToken(id);
    
    const reference = admin.database().ref('users/' + id)
    reference.set({
        email: profile_info.email,
        username: profile_info.display_name,
        profile_picture: profile_picture,
        access_token: access_token,
        refresh_token: refresh_token,
        firebase_token: firebase_token
    })
    return firebase_token
}