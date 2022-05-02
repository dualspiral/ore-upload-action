# Upload to Ore Github Action

This action enables [Sponge](https://spongepowered.org/) plugin developers to deploy to [Ore](https://ore.spongepowered.org/) as part of Github Actions.

## Getting your Ore API key

You will need an API key with the `create_version` scope. You may need the `post_as_organization` scope if you are planning to use the action for a plugin owned by an organisation. You can get an API key from your profile on Ore and selecting the key icon (at https://ore.spongepowered.org/{user}/settings/apiKeys).

## Uploading files

**This action requires the use of the [Upload Artifact](https://github.com/actions/upload-artifact) action.**

### Plugin file (required)

As part of your Actions workflow, ensure that you use the upload-artifact action to upload your compiled plugin. You may use a glob to select multiple jar files and this action will attempt to select a file that contains either:

* `META-INF/sponge-plugins.json` file for API 8+ plugins; or
* `mcmod-info` file for API 1-7 plugins or Forge mods.

Note that this action will select the first it detects, so be careful to ensure you only select the plugin file you wish to upload.

### Version description file (optional)

If you generate a file that contains your version description, you can use that. Create a **separate** artifact that contains the file with the text/markdown in it. **Be aware**, the first file found within the artifact will be used for this text, so ensure that you are specific in which file you upload.
## Using the action

The following is a sample step you may use as a template for your own action.

```
- name: Upload to Ore
  uses: dualspiral/ore-upload-action@v1
  with:
    plugin: <uploaded plugin artifact name>
    description: <uploaded plugin artifact name | string>
    apiKey: <string>
    channel: [string, optional] 
    pluginId: <string>
    createForumPost: [boolean, optional, defaults to true]
```

| Key             | Value                                                                                                              |
========================================================================================================================================
| plugin          | The name of the artifact that you uploaded your plugin to in a previous step/job.                                  |
| description     | One of <ul><li>The name of an artifact that you uploaded your description into</li><li>A string</li></ul>          |
| apiKey          | The Ore API Key to authenticate with. **It is strongly recommended that you use Github Secrets for your API key.** |
| channel         | If specified, the tag/channel that your plugin should be assigned to.                                              |
| pluginId        | The plugin ID.                                                                                                     |
| createForumPost | If true, causes Ore to post the description as a forum post for this version.                                      |

There are a further two variables that you may wish to use in special circumstances _only_.

```
    oreUrl: [base Ore URL, optional, defaults to https://ore.spongepowered.org]
    verboseLogging: [boolean, optional, defaults false]
```

| Key             | Value                                                                                                                                  |
============================================================================================================================================================
| oreUrl          | The base URL of the Ore instance to upload to. Defaults to https://ore.spongepowered.org.                                              |
| verboseLogging  | If true, increases logging in the action. Generally used for debugging this action only - important information will always be logged. |

