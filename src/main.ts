import * as core from '@actions/core';
import * as exec from '@actions/exec';
import * as io from '@actions/io';
import * as semver from 'semver';
import * as os from "os";
import * as fs from "fs";
import * as path from "path";
import * as tc from '@actions/tool-cache';

// const IS_WINDOWS: boolean = process.platform === "win32";
// const IS_MAC: boolean = process.platform === "darwin";
// const IS_LINUX: boolean = process.platform === "linux";
// const IS_UNIX: boolean = IS_MAC || IS_LINUX;
const CONDA_STANDALONE_BASE_URL: string = 'https://repo.anaconda.com/pkgs/misc/conda-execs';
const HOME_BIN_DIR: string = path.join(os.homedir(), 'bin');
const IS_WINDOWS: boolean = process.platform === "win32";

interface ISucceedResult {
  ok: true;
  data: string;
}
interface IFailedResult {
  ok: false;
  error: Error;
}
type Result = ISucceedResult | IFailedResult;

export interface IArchitectures {
  [key: string]: string;
}

export interface IOperatingSystems {
  [key: string]: string;
}

const ARCHITECTURES: IArchitectures = {
  win32: "win-64",
  linux: "linux-64",
  darwin: "osx-64"
};

// const OS_NAMES: IOperatingSystems = {
//   win32: "Windows",
//   darwin: "MacOSX",
//   linux: "Linux"
// };


/**
 * Determine if this version of Conda supports conda init
 * 
 * @param condaVersion
 */
function hasCondaInit(condaVersion: string): boolean {
  return semver.satisfies(semver.coerce(condaVersion) || condaVersion, ">=4.6.0");
}

/**
 * Download specific version miniconda defined by version, arch and python major version
 *
 * @param condaStandaloneVersion
 */
async function downloadCondaStandalone(
  condaStandaloneVersion: string,
  platform: string
): Promise<Result> {
  let downloadPath: string;

  const arch: string = ARCHITECTURES[platform];
  if (!arch) {
    return { ok: false, error: new Error(`"${platform}" is not a valid platform.`) };
  }

  const downloadURL = `${CONDA_STANDALONE_BASE_URL}/conda-${condaStandaloneVersion}-${arch}.exe`;
  core.info(`Downloading Conda standalone from: ${downloadURL}`);

  await io.mkdirP(HOME_BIN_DIR);
  const condaPath = path.join(HOME_BIN_DIR, "conda.exe");

  // Look for cache to use
  const cachedCondaStandalone = tc.find(condaPath, condaStandaloneVersion, arch);
  if (cachedCondaStandalone) {
    core.info(`Found cached Conda standalone at ${cachedCondaStandalone}`);
    downloadPath = cachedCondaStandalone;
  } else {
    try {
      downloadPath = await tc.downloadTool(downloadURL, condaPath);
      core.debug(`Download successful ${downloadPath}`)
      core.info(`Caching Conda standalone ${downloadPath}`);

      await tc.cacheFile(
        condaPath,
        "conda.exe",
        `CondaStandalone-${condaStandaloneVersion}-${arch}`,
        condaStandaloneVersion,
        arch
      );
    } catch (err) {
      return {ok: false, error: err};
    }
  }
  return {ok: true, data: downloadPath};

}

async function run(): Promise<void> {
  try {
    const condaStandaloneVersion: string = core.getInput(
      "conda-standalone-version"
    );
    const result = await downloadCondaStandalone(
      condaStandaloneVersion,
      process.platform
    );
    if (!result.ok) {
      throw result.error;
    }

    const condaExePath: string = result.data;

    fs.chmodSync(condaExePath, 0o755);

    const condaVersion: string = core.getInput("conda-version");

    core.info(`Creating base environment with Conda ${condaVersion}`);

    let condaBase: string;
    if (condaVersion == 'latest') {
      condaBase = 'conda';
    } else {
      condaBase = `conda=${condaVersion}`;
    }

    await exec.exec(`${condaExePath} create -y -p ${os.homedir()}/miniconda ${condaBase}`);

    if (IS_WINDOWS) {
      core.addPath(path.join(os.homedir(), 'miniconda', 'Scripts'));
      if (hasCondaInit(condaVersion)) {
        await exec.exec(`${os.homedir()}\\miniconda\\Scripts\\conda init bash`);
      } else {
        // await exec.exec(`source ${os.homedir()}\\miniconda\\Scripts\\activate root`);
      }
    } else {
      core.addPath(path.join(os.homedir(), 'miniconda', 'bin'));
      if (hasCondaInit(condaVersion)) {
        await exec.exec(`${os.homedir()}/miniconda/bin/conda init bash`);
      } else {
        // await exec.exec(`source ${os.homedir()}/miniconda/bin/activate root`);
      }
    }
    // core.addPath('./miniconda/bin');
    // await exec.exec('source ./miniconda/bin/activate root');

  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
