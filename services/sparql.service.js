import { update, query } from "mu";
import sha256 from "crypto-js/sha256";
import uuidv4 from "uuid/v4";

import { STATUSES } from "../utils/constants";

import {
  updateQuery,
  insertQuery,
  queryPublishResources,
  querySignResources,
  querySignResourcesWithError,
  updatePublishedQuery,
  deleteQuery,
  retryQuery,
  queryPublishResourcesWithError,
  queryErrors,
  deleteQueryErrors,
  queryAgendas,
  queryAgendasToSign
} from "../utils/queries";

export const getPublishAgendasByStatus = async status => {
  let unpublishedQuery;
  if (status === STATUSES.RETRY) {
    unpublishedQuery = queryPublishResourcesWithError(status);
  } else {
    unpublishedQuery = queryAgendas(status);
  }
  return query(unpublishedQuery);
};

export const getSignAgendasByStatus = async status => {
  let unpublishedQuery;
  if (status === STATUSES.RETRY) {
    unpublishedQuery = queryPublishResourcesWithError(status);
  } else {
    unpublishedQuery = queryAgendasToSign(status);
  }
  return query(unpublishedQuery);
};

export const getPublishResourcesByStatus = async status => {
  let unpublishedQuery;
  if (status === STATUSES.RETRY) {
    unpublishedQuery = queryPublishResourcesWithError(status);
  } else {
    unpublishedQuery = queryPublishResources(status);
  }
  return query(unpublishedQuery);
};

export const getSignResourcesByStatus = async status => {
  let signQuery;
  if (status === STATUSES.RETRY) {
    signQuery = querySignResourcesWithError(status);
  } else {
    signQuery = querySignResources(status);
  }
  return query(signQuery);
};

export const setResourceStatus = async (id, status, content = null) => {
  const updateStatusQuery =
    status === STATUSES.PUBLISHED
      ? updatePublishedQuery(id, content)
      : updateQuery(id, status);
  await update(updateStatusQuery);
};

export const insertResource = async params => {
  const { id, type, person, version } = params;
  const persons = [
    "45e2842b-e4ae-4593-a66f-551b8379d6b3",
    "385893a9-75d7-4557-9977-29999044b8aa",
    "eab29f18-3a50-4a89-842a-2255c8711ce6"
  ];
  const insertResourceQuery = insertQuery(
    uuidv4(),
    id === null ? uuidv4() : id,
    person === null ? uuidv4() : persons[person],
    type === "publish" ? "PublishedResource" : "SignedResource",
    version
  );
  await update(insertResourceQuery);
};

export const insertRandomResource = async () => {
  const insertResourceQuery = insertQuery(
    uuidv4(),
    uuidv4(),
    "uuidv44",
    "PublishedResource",
    1
  );
  await update(insertResourceQuery);
};

export const getByStatus = async status => {
  const resultPublish = await getPublishResourcesByStatus(status);
  const resultSign = await getSignResourcesByStatus(status);

  const mapData = (resource, type) => ({
    id: resource.s.value,
    content: resource.content.value,
    signatory: resource.signatory.value,
    resourceId: resource.publishedResource
      ? resource.publishedResource.value
      : null,
    timestamp: resource.timestamp.value,
    resourceType: resource.resourceType.value,
    hash: sha256(resource.content.value).toString(),
    hasError: resource.hasError ? resource.hasError.value : null,
    type
  });

  const publishedResources = resultPublish.results.bindings.map(
    resource => mapData(resource, "Publishing") // TODO don't hardcode
  );

  const signedResources = resultSign.results.bindings.map(
    resource => mapData(resource, "Signing") // TODO don't hardcode
  );

  return publishedResources.concat(signedResources);
};

const deleteResource = async id => {
  const deleteResourceQuery = deleteQuery(id);
  await update(deleteResourceQuery);
};

export const setResourceStatusRetry = async (id, e, count) => {
  const retryResourceQuery = retryQuery(
    id,
    count,
    uuidv4(),
    e.error.errors[0].title
  );
  await update(retryResourceQuery);
};

export const getErrors = async () => {
  const unsignedQuery = queryErrors();
  const result = await query(unsignedQuery);

  const mapData = resource => ({
    id: resource.s.value,
    err: resource.err.value,
    count: resource.count.value,
    origin: resource.uuid.value
  });

  const errors = result.results.bindings.map(resource => mapData(resource));

  const distinctErrors = [];
  errors.forEach(error => {
    let con = true;
    distinctErrors.forEach(distinctError => {
      if (distinctError.origin === error.origin) {
        if (error.count <= distinctError.count) {
          con = false;
        }
      }
    });
    if (con) {
      const indexAlreadyExists = distinctErrors.findIndex(
        preError => preError.origin === error.origin
      );

      if (indexAlreadyExists !== -1) {
        distinctErrors.splice(indexAlreadyExists, 1, error);
      } else {
        distinctErrors.push(error);
      }
    }
  });

  return distinctErrors;
};

export const reset = async () => {
  const unpublished = await getByStatus(STATUSES.UNPUBLISHED);
  const published = await getByStatus(STATUSES.PUBLISHED);
  const publishing = await getByStatus(STATUSES.PUBLISHING);
  const failed = await getByStatus(STATUSES.FAILED);
  const retry = await getByStatus(STATUSES.RETRY);
  const errors = await getErrors();

  const resources = Object.assign(
    [],
    unpublished instanceof Array ? unpublished : [],
    published instanceof Array ? published : [],
    publishing instanceof Array ? publishing : [],
    failed instanceof Array ? failed : [],
    retry instanceof Array ? retry : []
  );
  if (resources instanceof Array) {
    for (const resource of resources) {
      await deleteResource(resource.id);
    }
  }

  if (errors instanceof Array) {
    for (const resource of errors) {
      await deleteQueryErrors(resource.id);
    }
  }
};
