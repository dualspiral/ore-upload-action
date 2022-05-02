const core = require('@actions/core');
const artifact = require('@actions/artifact');
const artifactClient = artifact.create();
const fs = require("fs").promises;
const FormData = require('form-data');
const axios = require("axios").default

// most @actions toolkit packages have async methods
async function run() {
  try {
    core.log("Starting deployment");
    // Get the plugin
    const pluginLocation = await artifactClient.downloadArtifact(core.getInput("plugin"));
    const tag = core.getInput("tag");
    const oreUrl = core.getInput("oreUrl").replaceAll(/\/$/g, "");
    const projectId = core.getInput("projectId");
    const apiKey = `OreApi apikey="${core.getInput("apiKey")}"`;

    // Check to see if we have an artefact for the description, else consider it a string.
    const descriptionString = core.getInput("description")
    const descriptionInput =
        await artifactClient.downloadArtifact(descriptionString)
            .then(response => fs.readFile(response.downloadPath))
            .then(buffer => buffer.toString())
            // eslint-disable-next-line no-unused-vars
            .catch(ignored => Promise.resolve(descriptionString))

    const apiAuthUrl = `${oreUrl}/api/v2/authenticate`
    const apiPostVersionUrl = `${oreUrl}/api/v2/${projectId}/versions`

    // Start by authenticating with the Ore client
    console.log("Attempting to authenticate against Ore v2");
    const fileToSend = await fs.readFile(pluginLocation.downloadPath);
    let infoToSend;
    if (tag !== undefined && tag !== "") {
      infoToSend = {
        "create_forum_post": core.getBooleanInput("createForumPost"),
        "description": descriptionInput,
        "tags": core.getInput("tag")
      }
    } else {
      infoToSend = {
        "create_forum_post": core.getBooleanInput("createForumPost"),
        "description": descriptionInput
      }
    }
    axios.post(apiAuthUrl,
        {
          "expires_in": 120
        },
      {
      headers: {
        "Authorization": apiKey
      }
    }).then(response => {
      if (response.status === 200) {
        const sessionHeader = `OreKey session="${response.data.session}"`;
        const formData = new FormData();
        formData.append("plugin-info", infoToSend);
        formData.append("plugin-file", fileToSend);
        return axios.post(apiPostVersionUrl,
            formData,
            {
              headers: {
                "Authorization": sessionHeader
              }
            });
      } else {
        return Promise.reject(`Did not complete authorisation (received status code ${response.status})`);
      }
    })
    .then(response => {
      if (response.status === 201) {
        console.log("Deployment successful");
        return Promise.resolve(response);
      } else {
        return Promise.reject(`Deployment failed with error code ${response.status}.`)
      }
    })
    .catch(rejection => {
      core.setFailed(rejection);
    })
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
