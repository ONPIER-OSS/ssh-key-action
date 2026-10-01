import * as fs from "fs";
import * as path from "path";

import * as core from "@actions/core";

import * as common from "./common";

/** file creation info */
interface FileInfo {
    /** file name */
    name: string;
    /** file contents */
    contents: string;
    /** creation options */
    options: fs.WriteFileOptions;
    /** file must not exist when creating */
    mustNotExist: boolean;
}

/** default known_hosts */
const KNOWN_HOSTS = [];

try {
    main();
} catch (err) {
    if (err instanceof Error) {
        core.setFailed(err);
    }
}

/**
 * main function
 */
export function main(): void {
    const sshDirName = common.getSshDirectory();

    // create ".ssh" directory
    const backupSuffix = common.createBackupSuffix(sshDirName);
    if (backupSuffix === "") {
        createDirectory(sshDirName);
        console.log(`✅SSH directory "${sshDirName}" has been created successfully.`);
    }

    // files to be created
    const files = buildFilesToCreate(sshDirName);

    // back up & create files
    const createdFileNames: string[] = [];
    const backedUpFileNames: string[] = [];
    for (const file of files) {
        const pathName = path.join(sshDirName, file.name);
        if (backup(pathName, backupSuffix, file.mustNotExist)) {
            backedUpFileNames.push(file.name);
        }

        fs.writeFileSync(pathName, file.contents, file.options);
        createdFileNames.push(file.name);
    }
    common.saveCreatedFileNames(createdFileNames);

    if (createdFileNames.length > 0) {
        console.log(`✅Following files have been created in "${sshDirName}" successfully; ${createdFileNames.join(", ")}`);
    }
    if (backedUpFileNames.length > 0) {
        console.log(`✅Following files have been backed up in suffix "${backupSuffix}" successfully; ${backedUpFileNames.join(", ")}`);
    }
}

/**
 * build files to create
 * @param dirName directory name in where files will be created
 * @returns files
 */
function buildFilesToCreate(dirName: string): FileInfo[] {
    // parameters
    const key = core.getInput("key", {
        required: true,
    });
    const name = core.getInput("name");
    const knownHosts = core.getInput("known_hosts", {
        required: true,
    });
    const config = core.getInput("config");
    const ifKeyExists = core.getInput("if_key_exists");

    // files to be created
    const files: FileInfo[] = [
        {
            name: "known_hosts",
            contents: insertLf(buildKnownHostsArray(knownHosts).join("\n"), true, true),
            options: {
                mode: 0o644,
                flag: "a",
            },
            mustNotExist: false,
        },
    ];
    if (shouldCreateKeyFile(path.join(dirName, name), ifKeyExists)) {
        files.push({
            name: name,
            contents: insertLf(key, false, true),
            options: {
                mode: 0o400,
                flag: "wx",
            },
            mustNotExist: true,
        });
    }
    if (config !== "") {
        files.push({
            name: "config",
            contents: insertLf(config, true, true),
            options: {
                mode: 0o644,
                flag: "a",
            },
            mustNotExist: false,
        });
    }

    return files;
}

/**
 * create directory
 * @param dirName directory name to remove
 */
function createDirectory(dirName: string): void {
    fs.mkdirSync(dirName, {
        recursive: true,
        mode: 0o700,
    });
}

/**
 * back up file
 * @param fileName file to back up
 * @param backupSuffix suffix
 * @param removeOrig remove original file
 * @returns is file backed up?
 */
function backup(fileName: string, backupSuffix: string, removeOrig: boolean): boolean {
    if (backupSuffix === "") {
        return false;
    }
    if (!fs.existsSync(fileName)) {
        return false;
    }

    // move -> copy (in order to keep permissions when restore)
    const fileNameBak = `${fileName}${backupSuffix}`;
    fs.renameSync(fileName, fileNameBak);
    if (!removeOrig) {
        fs.copyFileSync(fileNameBak, fileName);
    }

    return true;
}

/**
 * prepend/append LF to value if not empty
 * @param value the value to insert LF
 * @param prepend true to prepend
 * @param append true to append
 * @returns new value
 */
function insertLf(value: string, prepend: boolean, append: boolean): string {
    let affectedValue = value;

    if (value.length === 0) {
        // do nothing if empty
        return "";
    }
    if (prepend && !affectedValue.startsWith("\n")) {
        affectedValue = `\n${affectedValue}`;
    }
    if (append && !affectedValue.endsWith("\n")) {
        affectedValue = `${affectedValue}\n`;
    }

    return affectedValue;
}

/**
 * should create SSH key file?
 * @param keyFilePath path of key file
 * @param ifKeyExists action if SSH key exists
 * @returns Yes/No
 */
function shouldCreateKeyFile(keyFilePath: string, ifKeyExists: string): boolean {
    if (!fs.existsSync(keyFilePath)) {
        // should create if file does not exist
        return true;
    }

    switch (ifKeyExists) {
        case "replace":
            // should create if replace (existing file will be backed up when creating)
            return true;

        case "ignore":
            // should NOT create if ignore
            return false;

        default:
            // error otherwise
            throw new Error(`SSH key is already installed. Set "if_key_exists" to "replace" or "ignore" in order to avoid this error.`);
    }
}

/**
 * build array of known_hosts
 * @param knownHosts known_hosts
 * @returns array of known_hosts
 */
function buildKnownHostsArray(knownHosts: string): string[] {
    if (knownHosts === "unnecessary") {
        return KNOWN_HOSTS;
    }
    return KNOWN_HOSTS.concat(knownHosts);
}
