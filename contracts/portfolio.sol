// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract Portfolio {
    enum Status { Pending, Confirmed, Rejected }

    struct EventRec {
        address owner;
        address organizer;
        uint64  startAt;
        uint64  endAt;
        bytes32 contentHash;
        string  contentURI;
        Status  status;
        string  resultURI;
        string  reasonURI;
    }

    error NotOrganizer();
    error NotPending();
    error NotConfirmed();

    uint256 public lastId;
    mapping(uint256 => EventRec) public events;

    event EventRequested(
        uint256 indexed id,
        address indexed owner,
        address indexed organizer
    );
    event EventConfirmed(uint256 indexed id, address indexed organizer);
    event EventRejected(uint256 indexed id, address indexed organizer, string reasonURI);

    function createEventRequest(
        address organizer,
        uint64 startAt,
        uint64 endAt,
        bytes32 contentHash,
        string calldata contentURI
    ) external returns (uint256 id) {
        require(organizer != address(0), "bad organizer");
        require(startAt <= endAt, "bad time range");

        id = ++lastId;
        events[id] = EventRec({
            owner: msg.sender,
            organizer: organizer,
            startAt: startAt,
            endAt: endAt,
            contentHash: contentHash,
            contentURI: contentURI,
            status: Status.Pending,
            resultURI: "",
            reasonURI: ""
        });

        emit EventRequested(id, msg.sender, organizer);
    }

    function confirmEvent(uint256 id, string calldata resultURI) external {
        EventRec storage e = events[id];
        if (msg.sender != e.organizer) revert NotOrganizer();
        if (e.status != Status.Pending) revert NotPending();

        e.status = Status.Confirmed;
        e.resultURI = resultURI;
        emit EventConfirmed(id, msg.sender);
    }

    function rejectEvent(uint256 id, string calldata reasonURI) external {
        EventRec storage e = events[id];
        if (msg.sender != e.organizer) revert NotOrganizer();
        if (e.status != Status.Pending) revert NotPending();

        e.status = Status.Rejected;
        e.reasonURI = reasonURI;
        emit EventRejected(id, msg.sender, reasonURI);
    }

    function getEvent(uint256 id) external view returns (EventRec memory) {
        return events[id];
    }

    function totalEvents() external view returns (uint256) {
        return lastId;
    }
}
